import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STANDARDS = {
    PTES: 'PTES',
    OWASP: 'OWASP',
    PCI_DSS: 'PCI-DSS',
};

class ComplianceLogger {
    private logsDir: string;

    constructor() {
        this.logsDir = path.join(process.cwd(), '.chuck', 'logs');
        this.ensureLogDirExists();
    }

    ensureLogDirExists() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    logEvent(standard: keyof typeof STANDARDS, event: string, evidence: string) {
        if (!STANDARDS[standard]) {
            throw new Error(`Unsupported standard: ${standard}`);
        }
        const logEntry = this.createLogEntry(standard, event, evidence);
        this.saveLog(logEntry);
    }

    createLogEntry(standard: string, event: string, evidence: string) {
        const timestamp = new Date().toISOString();
        return { timestamp, standard, event, evidence };
    }

    saveLog(logEntry: object) {
        const logFile = path.join(this.logsDir, 'compliance-log.jsonl');
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }

    generateReport() {
        const logFile = path.join(this.logsDir, 'compliance-log.jsonl');
        if (!fs.existsSync(logFile)) {
            throw new Error('No logs available for report generation.');
        }
        return fs.readFileSync(logFile, 'utf-8');
    }
}

export default ComplianceLogger;