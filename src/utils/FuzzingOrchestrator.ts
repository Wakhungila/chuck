// FuzzingOrchestrator.ts

import { AdaptiveFuzzer } from './AdaptiveFuzzer';
import { runCommand } from '../tools/shell';

export class FuzzingOrchestrator {
    private fuzzer: AdaptiveFuzzer;

    constructor() {
        this.fuzzer = new AdaptiveFuzzer();
    }

    /**
     * Orchestrates a stateful fuzzing campaign against a target endpoint.
     * Sequence: Seed -> Mutate -> Execute with Auth -> Analyze
     */
    async runWebFuzz(params: { 
        url: string, 
        method: string, 
        seedData: any, 
        token?: string 
    }): Promise<any[]> {
        console.log(`[FuzzingOrchestrator] Starting session on ${params.url}`);
        const mutations = this.fuzzer.generateMutations(params.seedData, 5);
        const results = [];

        for (const data of mutations) {
            const authHeader = params.token ? `-H "Authorization: Bearer ${params.token}"` : "";
            const body = typeof data === 'string' ? data : JSON.stringify(data);
            const cmd = `curl -s -w "%{http_code}" -X ${params.method} ${authHeader} -d '${body}' ${params.url}`;
            
            const output = await runCommand(cmd);
            results.push({
                payload: body,
                response: output
            });
        }

        return results;
    }
}

export default FuzzingOrchestrator;