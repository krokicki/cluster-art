#!/usr/bin/env python3
"""
Migration script to convert flat cache structure to hierarchical.

Moves files from:
    <cache_folder>/<timestamp>.json.gz
To:
    <cache_folder>/YYYYMM/DD/<timestamp>.json.gz

Usage:
    python migrate_cache.py              # Migrate cache/ folder
    python migrate_cache.py /path/to/cache  # Migrate specific folder
    python migrate_cache.py --dry-run    # Show what would be done
"""

import argparse
import shutil
from datetime import datetime
from pathlib import Path


def get_cache_path_for_timestamp(timestamp: int, cache_folder: Path) -> Path:
    """Get the hierarchical cache path for a given unix timestamp."""
    dt = datetime.fromtimestamp(timestamp)
    year_month = dt.strftime("%Y%m")
    day = dt.strftime("%d")
    return cache_folder / year_month / day / f"{timestamp}.json.gz"


def migrate_cache(cache_folder: Path, dry_run: bool = False) -> tuple[int, int]:
    """Migrate flat cache files to hierarchical structure.

    Returns:
        Tuple of (files_moved, files_skipped)
    """
    if not cache_folder.exists():
        print(f"Cache folder does not exist: {cache_folder}")
        return 0, 0

    # Find all flat cache files (only in root, not in subdirs)
    flat_files = [f for f in cache_folder.glob("*.json.gz") if f.is_file()]
    flat_json = [f for f in cache_folder.glob("*.json") if f.is_file()]
    all_flat = flat_files + flat_json

    if not all_flat:
        print("No flat cache files found to migrate.")
        return 0, 0

    print(f"Found {len(all_flat)} flat cache files to migrate.")

    moved = 0
    skipped = 0

    for filepath in sorted(all_flat):
        # Extract timestamp from filename
        stem = filepath.stem
        if stem.endswith('.json'):  # Handle .json.gz case
            stem = stem[:-5]

        try:
            timestamp = int(stem)
        except ValueError:
            print(f"  Skipping (invalid timestamp): {filepath.name}")
            skipped += 1
            continue

        # Determine target path
        if filepath.suffix == '.gz':
            target = get_cache_path_for_timestamp(timestamp, cache_folder)
        else:
            # For plain .json files, keep as .json in hierarchical structure
            dt = datetime.fromtimestamp(timestamp)
            year_month = dt.strftime("%Y%m")
            day = dt.strftime("%d")
            target = cache_folder / year_month / day / f"{timestamp}.json"

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


def main():
    parser = argparse.ArgumentParser(
        description="Migrate flat cache structure to hierarchical YYYYMM/DD/<timestamp>.json.gz"
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
    print(f"Migrating cache: {cache_folder}")
    if args.dry_run:
        print("(DRY RUN - no changes will be made)")
    print()

    moved, skipped = migrate_cache(cache_folder, dry_run=args.dry_run)

    print()
    if args.dry_run:
        print(f"Would move {moved} files, skip {skipped} files.")
    else:
        print(f"Moved {moved} files, skipped {skipped} files.")


if __name__ == "__main__":
    main()
