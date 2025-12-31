// Resource model - represents a single CPU or GPU slot

export class Resource {
    constructor(hostname, type, index, user, hostData, hardwareGroup) {
        this.hostname = hostname;
        this.type = type; // 'cpu' or 'gpu'
        this.index = index; // Index within the host
        this.user = user || null; // Username or null if idle
        this.x = 0; // Grid position
        this.y = 0;

        // Additional metadata from host
        this.gpuType = hostData?.gpu_type || null;
        this.utilization = hostData?.utilization || 0;
        this.status = hostData?.status || 'unknown';
        this.load = hostData?.load || {};
        this.hardwareGroup = hardwareGroup || 'Unknown';

        // Job info (populated later from raw data)
        this.jobId = null;
        this.jobName = null;
    }

    get isIdle() {
        return !this.user || this.user === '';
    }

    get row() {
        // Extract row prefix (e.g., "h04" from "h04u08")
        const match = this.hostname.match(/^([a-z]+\d+)/);
        return match ? match[1] : this.hostname;
    }
}
