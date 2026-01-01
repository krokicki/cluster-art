#!/usr/bin/env python3
"""
Migration script to convert flat cache structure to hierarchical and fix misplaced files.

Moves files from:
    <cache_folder>/<timestamp>.json.gz
To:
    <cache_folder>/YYYYMM/DD/<timestamp>.json.gz

Also fixes files that are in wrong directories due to timezone issues
(e.g., created with local time instead of UTC).

Usage:
    python -m cluster_art.migrate_cache              # Migrate cache/ folder
    python -m cluster_art.migrate_cache /path/to/cache  # Migrate specific folder
    python -m cluster_art.migrate_cache --dry-run    # Show what would be done
"""

import argparse
import shutil
from datetime import datetime, timezone
from pathlib import Path


def get_cache_path_for_timestamp(timestamp: int, cache_folder: Path, extension: str = ".json.gz") -> Path:
    """Get the hierarchical cache path for a given unix timestamp.

    Uses UTC to ensure consistent paths regardless of local timezone.
    """
    dt = datetime.fromtimestamp(timestamp, timezone.utc)
    year_month = dt.strftime("%Y%m")
    day = dt.strftime("%d")
    return cache_folder / year_month / day / f"{timestamp}{extension}"


def get_timestamp_from_path(filepath: Path) -> int | None:
    """Extract unix timestamp from cache file path."""
    stem = filepath.stem
    if stem.endswith('.json'):  # Handle .json.gz case
        stem = stem[:-5]
    try:
        return int(stem)
    except ValueError:
        return None


def migrate_flat_files(cache_folder: Path, dry_run: bool = False) -> tuple[int, int]:
    """Migrate flat cache files to hierarchical structure.

    Returns:
        Tuple of (files_moved, files_skipped)
    """
    # Find all flat cache files (only in root, not in subdirs)
    flat_files = [f for f in cache_folder.glob("*.json.gz") if f.is_file()]
    flat_json = [f for f in cache_folder.glob("*.json") if f.is_file()]
    all_flat = flat_files + flat_json

    if not all_flat:
        return 0, 0

    print(f"Found {len(all_flat)} flat cache files to migrate.")

    moved = 0
    skipped = 0

    for filepath in sorted(all_flat):
        timestamp = get_timestamp_from_path(filepath)
        if timestamp is None:
            print(f"  Skipping (invalid timestamp): {filepath.name}")
            skipped += 1
            continue

        # Determine target path (preserve extension)
        extension = ".json.gz" if filepath.suffix == '.gz' else ".json"
        target = get_cache_path_for_timestamp(timestamp, cache_folder, extension)

        if target.exists():
            print(f"  Skipping (target exists): {filepath.name} -> {target.relative_to(cache_folder)}")
            skipped += 1
            continue

        if dry_run:
            print(f"  Would move: {filepath.name} -> {target.relative_to(cache_folder)}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(filepath), str(target))
            print(f"  Moved: {filepath.name} -> {target.relative_to(cache_folder)}")

        moved += 1

    return moved, skipped


def fix_misplaced_files(cache_folder: Path, dry_run: bool = False) -> tuple[int, int]:
    """Fix files in wrong directories due to timezone issues.

    Files may be in wrong YYYYMM/DD directories if they were created using
    local time instead of UTC. This function moves them to the correct location.

    Returns:
        Tuple of (files_fixed, files_skipped)
    """
    # Find all files in subdirectories
    gz_files = list(cache_folder.glob("*/*/*.json.gz"))
    json_files = list(cache_folder.glob("*/*/*.json"))
    all_hierarchical = gz_files + json_files

    if not all_hierarchical:
        return 0, 0

    fixed = 0
    skipped = 0
    checked = 0

    for filepath in sorted(all_hierarchical):
        timestamp = get_timestamp_from_path(filepath)
        if timestamp is None:
            skipped += 1
            continue

        checked += 1

        # Determine correct path using UTC
        extension = ".json.gz" if filepath.suffix == '.gz' else ".json"
        correct_path = get_cache_path_for_timestamp(timestamp, cache_folder, extension)

        # Check if file is already in correct location
        if filepath == correct_path:
            continue

        # File is misplaced
        if correct_path.exists():
            print(f"  Skipping (target exists): {filepath.relative_to(cache_folder)} -> {correct_path.relative_to(cache_folder)}")
            skipped += 1
            continue

        if dry_run:
            print(f"  Would fix: {filepath.relative_to(cache_folder)} -> {correct_path.relative_to(cache_folder)}")
        else:
            correct_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(filepath), str(correct_path))
            print(f"  Fixed: {filepath.relative_to(cache_folder)} -> {correct_path.relative_to(cache_folder)}")

        fixed += 1

    if checked > 0 and fixed == 0 and skipped == 0:
        print(f"  All {checked} hierarchical files are in correct locations.")

    return fixed, skipped


def cleanup_empty_dirs(cache_folder: Path, dry_run: bool = False) -> int:
    """Remove empty directories left after migration.

    Returns:
        Number of directories removed
    """
    removed = 0

    # Find all subdirectories, deepest first
    all_dirs = sorted(cache_folder.glob("**/"), key=lambda p: len(p.parts), reverse=True)

    for dirpath in all_dirs:
        if dirpath == cache_folder:
            continue
        if dirpath.is_dir() and not any(dirpath.iterdir()):
            if dry_run:
                print(f"  Would remove empty dir: {dirpath.relative_to(cache_folder)}")
            else:
                dirpath.rmdir()
                print(f"  Removed empty dir: {dirpath.relative_to(cache_folder)}")
            removed += 1

    return removed


def migrate_cache(cache_folder: Path, dry_run: bool = False) -> dict:
    """Run full cache migration and fix.

    Returns:
        Dict with counts of operations performed
    """
    if not cache_folder.exists():
        print(f"Cache folder does not exist: {cache_folder}")
        return {"flat_moved": 0, "flat_skipped": 0, "fixed": 0, "fix_skipped": 0, "dirs_removed": 0}

    # Step 1: Migrate flat files
    print("Step 1: Migrating flat files to hierarchical structure...")
    flat_moved, flat_skipped = migrate_flat_files(cache_folder, dry_run)
    if flat_moved == 0 and flat_skipped == 0:
        print("  No flat files to migrate.")
    print()

    # Step 2: Fix misplaced hierarchical files
    print("Step 2: Fixing misplaced files (timezone corrections)...")
    fixed, fix_skipped = fix_misplaced_files(cache_folder, dry_run)
    print()

    # Step 3: Clean up empty directories
    print("Step 3: Cleaning up empty directories...")
    dirs_removed = cleanup_empty_dirs(cache_folder, dry_run)
    if dirs_removed == 0:
        print("  No empty directories to remove.")
    print()

    return {
        "flat_moved": flat_moved,
        "flat_skipped": flat_skipped,
        "fixed": fixed,
        "fix_skipped": fix_skipped,
        "dirs_removed": dirs_removed
    }


def main():
    parser = argparse.ArgumentParser(
        description="Migrate flat cache structure to hierarchical and fix misplaced files"
    )
    parser.add_argument(
        "cache_folder",
        type=Path,
        nargs="?",
        default=Path("cache"),
        help="Cache folder to migrate (default: cache)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )
    args = parser.parse_args()

    cache_folder = args.cache_folder.resolve()
    print(f"Cache migration: {cache_folder}")
    if args.dry_run:
        print("(DRY RUN - no changes will be made)")
    print()

    results = migrate_cache(cache_folder, dry_run=args.dry_run)

    print("Summary:")
    action = "Would" if args.dry_run else "Did"
    print(f"  {action} move {results['flat_moved']} flat files ({results['flat_skipped']} skipped)")
    print(f"  {action} fix {results['fixed']} misplaced files ({results['fix_skipped']} skipped)")
    print(f"  {action} remove {results['dirs_removed']} empty directories")


if __name__ == "__main__":
    main()
