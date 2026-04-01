// AdaptiveFuzzer.ts

export class AdaptiveFuzzer {
    private mutationStrategies: Array<(input: any) => any>;
    private payloads: string[] = [
        "' OR 1=1 --",
        "<script>alert(1)</script>",
        "{{config.__class__.__init__.__globals__['os'].popen('id').read()}}",
        "../../../../etc/passwd",
        "$(id)",
        "0"
    ];

    constructor() {
        this.mutationStrategies = this.initializeMutationStrategies();
    }

    private initializeMutationStrategies() {
        return [
            this.simpleMutationStrategy,
            this.complexMutationStrategy,
            this.boundaryValueStrategy,
            this.injectionStrategy
        ];
    }

    /**
     * Generates a batch of mutated inputs based on a seed.
     */
    public generateMutations(seed: any, count: number = 10): any[] {
        const mutations = [];
        for (let i = 0; i < count; i++) {
            mutations.push(this.applyMutation(seed));
        }
        return mutations;
    }

    private applyMutation(input: any): any {
        let strategy = this.mutationStrategies[Math.floor(Math.random() * this.mutationStrategies.length)];
        return strategy(input);
    }

    private boundaryValueStrategy(input: any): any {
        if (typeof input === 'number') return Math.random() > 0.5 ? 0 : 2147483647;
        if (typeof input === 'string') return "A".repeat(8192);
        return input;
    }

    private injectionStrategy(input: any): any {
        if (typeof input === 'string') {
            return this.payloads[Math.floor(Math.random() * this.payloads.length)];
        }
        return input;
    }

    private simpleMutationStrategy(input: any): any {
        if (typeof input === 'string') {
            return input + "';";
        }
        return input;
    }

    private complexMutationStrategy(input: any): any {
        if (typeof input === 'object' && input !== null) {
            const keys = Object.keys(input);
            const key = keys[Math.floor(Math.random() * keys.length)];
            return { ...input, [key]: null };
        }
        return input;
    }
}

export default AdaptiveFuzzer;