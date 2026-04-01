// Type definitions for security-related data

export interface Campaign {
    id: string;
    name: string;
    description?: string;
    startDate: string; 
    endDate?: string; 
    targets: Target[];
}

export interface Target {
    id: string;
    name: string;
    type: 'application' | 'service' | 'infrastructure';
    vulnerabilities: Vulnerability[];
}

export interface Vulnerability {
    id: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    discoveredDate: string; 
    status: 'open' | 'closed' | 'in-progress';
    affectedTargets: Target[];
}

export interface FuzzingSession {
    id: string;
    campaignId: string;
    targetId: string;
    startDate: string; 
    endDate?: string; 
    results: FuzzingResult[];
}

export interface FuzzingResult {
    id: string;
    vulnerabilityId: string;
    status: 'identified' | 'false positive';
    timestamp: string; 
}

export interface ComplianceData {
    id: string;
    campaignId: string;
    compliant: boolean;
    checkedDate: string; 
    details?: string;
}