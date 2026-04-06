/**
 * VECTOR MEMORY ENGINE — Semantic Learning System
 * 
 * Advanced memory system with:
 * - Vector embeddings for semantic search
 * - MITRE ATT&CK pattern tagging
 * - Continuous learning from past engagements
 * - Pattern abstraction and generalization
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import axios from 'axios';

export interface MemoryVector {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    type: 'finding' | 'technique' | 'pattern' | 'lesson' | 'tool_output';
    severity?: string;
    mitreTechniques?: string[];
    targetTypes?: string[];
    toolsUsed?: string[];
    sessionId: string;
    timestamp: Date;
    validated?: boolean;
    successScore?: number; // 0-1 effectiveness rating
  };
}

export interface PatternAbstraction {
  id: string;
  name: string;
  description: string;
  conditions: string[];
  actions: string[];
  expectedOutcomes: string[];
  mitreMapping: string[];
  confidence: number;
  occurrences: number;
  lastSeen: Date;
}

export interface EngagementLesson {
  id: string;
  sessionId: string;
  summary: string;
  keyFindings: string[];
  successfulTechniques: string[];
  failedApproaches: string[];
  recommendations: string[];
  extractedPatterns: PatternAbstraction[];
  timestamp: Date;
}

export class VectorMemoryEngine {
  private storagePath: string;
  private patternsPath: string;
  private lessonsPath: string;
  private vectors: MemoryVector[] = [];
  private patterns: PatternAbstraction[] = [];
  private lessons: EngagementLesson[] = [];
  private embeddingModel: string;
  private apiHost: string;

  constructor(baseDir: string = '.chuck/memory') {
    this.storagePath = join(baseDir, 'vectors.json');
    this.patternsPath = join(baseDir, 'patterns.json');
    this.lessonsPath = join(baseDir, 'lessons.json');
    this.embeddingModel = process.env.CHUCK_EMBEDDING_MODEL || 'nomic-embed-text';
    this.apiHost = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
  }

  /**
   * Initialize memory engine - load existing data
   */
  async initialize(): Promise<void> {
    await mkdir(join(this.storagePath, '..'), { recursive: true });

    try {
      if (existsSync(this.storagePath)) {
        const data = await readFile(this.storagePath, 'utf-8');
        this.vectors = JSON.parse(data);
      }
    } catch { this.vectors = []; }

    try {
      if (existsSync(this.patternsPath)) {
        const data = await readFile(this.patternsPath, 'utf-8');
        this.patterns = JSON.parse(data);
      }
    } catch { this.patterns = []; }

    try {
      if (existsSync(this.lessonsPath)) {
        const data = await readFile(this.lessonsPath, 'utf-8');
        this.lessons = JSON.parse(data);
      }
    } catch { this.lessons = []; }
  }

  /**
   * Add new memory with automatic embedding
   */
  async addMemory(
    text: string,
    metadata: Omit<MemoryVector['metadata'], 'timestamp'>
  ): Promise<MemoryVector> {
    const embedding = await this.getEmbedding(text);
    
    const vector: MemoryVector = {
      id: crypto.randomUUID(),
      text,
      embedding,
      metadata: {
        ...metadata,
        timestamp: new Date()
      }
    };

    this.vectors.push(vector);
    await this.save();

    // Attempt to extract patterns
    await this.extractPatterns(vector);

    return vector;
  }

  /**
   * Semantic search across all memories
   */
  async search(query: string, filters?: {
    type?: MemoryVector['metadata']['type'];
    severity?: string;
    mitreTechniques?: string[];
    minConfidence?: number;
  }, limit: number = 10): Promise<MemoryVector[]> {
    const queryEmbedding = await this.getEmbedding(query);

    const scored = this.vectors
      .filter(v => {
        if (filters?.type && v.metadata.type !== filters.type) return false;
        if (filters?.severity && v.metadata.severity !== filters.severity) return false;
        if (filters?.mitreTechniques?.length && !v.metadata.mitreTechniques?.some(t => 
          filters.mitreTechniques!.includes(t)
        )) return false;
        if (filters?.minConfidence && (v.metadata.successScore || 0) < filters.minConfidence) return false;
        return true;
      })
      .map(v => ({
        vector: v,
        score: this.cosineSimilarity(queryEmbedding, v.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(s => s.vector);
  }

  /**
   * Extract patterns from a memory vector
   */
  private async extractPatterns(vector: MemoryVector): Promise<void> {
    if (vector.metadata.type !== 'finding' && vector.metadata.type !== 'lesson') return;

    // Simple pattern extraction based on keywords and structure
    const techniqueKeywords = ['bypass', 'injection', 'overflow', 'traversal', 'forgery', 'escalation'];
    const foundTechniques = techniqueKeywords.filter(k => 
      vector.text.toLowerCase().includes(k)
    );

    if (foundTechniques.length > 0 && vector.metadata.mitreTechniques?.length) {
      // Check if similar pattern exists
      const existingPattern = this.patterns.find(p => 
        p.mitreMapping.some(m => vector.metadata.mitreTechniques!.includes(m))
      );

      if (existingPattern) {
        existingPattern.occurrences++;
        existingPattern.lastSeen = new Date();
        existingPattern.confidence = Math.min(1, existingPattern.confidence + 0.1);
      } else {
        const newPattern: PatternAbstraction = {
          id: crypto.randomUUID(),
          name: `Pattern: ${foundTechniques.join('-')}`,
          description: `Automatically extracted from finding in session ${vector.metadata.sessionId}`,
          conditions: [`Target has ${vector.metadata.targetTypes?.join(', ') || 'vulnerable component'}`],
          actions: [`Apply ${foundTechniques.join(', ')} technique`],
          expectedOutcomes: ['Successful exploitation', 'Access gained'],
          mitreMapping: vector.metadata.mitreTechniques,
          confidence: 0.5,
          occurrences: 1,
          lastSeen: new Date()
        };
        this.patterns.push(newPattern);
      }

      await this.savePatterns();
    }
  }

  /**
   * Store lesson learned from engagement
   */
  async storeLesson(lesson: EngagementLesson): Promise<void> {
    this.lessons.push(lesson);
    
    // Add each key finding as searchable memory
    for (const finding of lesson.keyFindings) {
      await this.addMemory(finding, {
        type: 'lesson',
        sessionId: lesson.sessionId,
        mitreTechniques: lesson.extractedPatterns.flatMap(p => p.mitreMapping),
        successScore: 0.8
      });
    }

    await this.saveLessons();
  }

  /**
   * Get relevant patterns for current context
   */
  async getRelevantPatterns(context: string): Promise<PatternAbstraction[]> {
    const contextLower = context.toLowerCase();
    
    return this.patterns
      .filter(p => {
        // Match on pattern name, description, or MITRE techniques
        const searchText = `${p.name} ${p.description} ${p.mitreMapping.join(' ')}`.toLowerCase();
        return context.split(' ').some(word => 
          word.length > 3 && searchText.includes(word)
        );
      })
      .sort((a, b) => {
        // Prioritize high confidence and recent patterns
        const scoreA = a.confidence * a.occurrences * (Date.now() - a.lastSeen.getTime());
        const scoreB = b.confidence * b.occurrences * (Date.now() - b.lastSeen.getTime());
        return scoreB - scoreA;
      })
      .slice(0, 5);
  }

  /**
   * Abstract common patterns across multiple engagements
   */
  async abstractPatterns(): Promise<PatternAbstraction[]> {
    // Group findings by MITRE technique
    const byTechnique = new Map<string, MemoryVector[]>();
    
    this.vectors
      .filter(v => v.metadata.type === 'finding' && v.metadata.mitreTechniques?.length)
      .forEach(v => {
        v.metadata.mitreTechniques!.forEach(t => {
          if (!byTechnique.has(t)) byTechnique.set(t, []);
          byTechnique.get(t)!.push(v);
        });
      });

    const abstractions: PatternAbstraction[] = [];

    for (const [technique, vectors] of byTechnique.entries()) {
      if (vectors.length >= 3) { // Need minimum occurrences
        // Extract common conditions and actions
        const commonTargets = this.extractCommonality(vectors.map(v => v.metadata.targetTypes || []));
        const commonTools = this.extractCommonality(vectors.map(v => v.metadata.toolsUsed || []));

        const abstraction: PatternAbstraction = {
          id: crypto.randomUUID(),
          name: `Abstracted Pattern: ${technique}`,
          description: `Learned from ${vectors.length} engagements targeting ${technique}`,
          conditions: commonTargets.map(t => `Target has ${t}`),
          actions: commonTools.map(t => `Use ${t}`),
          expectedOutcomes: ['Vulnerability confirmed'],
          mitreMapping: [technique],
          confidence: Math.min(0.9, 0.5 + (vectors.length * 0.05)),
          occurrences: vectors.length,
          lastSeen: new Date()
        };

        abstractions.push(abstraction);
      }
    }

    // Merge with existing patterns
    this.patterns = [...this.patterns.filter(p => 
      !abstractions.some(a => a.mitreMapping.some(m => p.mitreMapping.includes(m)))
    ), ...abstractions];

    await this.savePatterns();
    return abstractions;
  }

  /**
   * Extract common elements from arrays
   */
  private extractCommonality(arrays: string[][]): string[] {
    const flat = arrays.flat();
    const counts = new Map<string, number>();
    flat.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
    
    return Array.from(counts.entries())
      .filter(([_, count]) => count >= 2)
      .map(([item]) => item);
  }

  /**
   * Get embedding from Ollama
   */
  private async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.apiHost}/api/embeddings`, {
        model: this.embeddingModel,
        prompt: text
      }, { timeout: 30000 });

      return response.data.embedding || [];
    } catch (error) {
      console.warn('Embedding generation failed, using zero vector:', error);
      return new Array(768).fill(0); // Fallback to zero vector
    }
  }

  /**
   * Calculate cosine similarity between vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  /**
   * Save vectors to disk
   */
  private async save(): Promise<void> {
    await writeFile(this.storagePath, JSON.stringify(this.vectors, null, 2));
  }

  /**
   * Save patterns to disk
   */
  private async savePatterns(): Promise<void> {
    await writeFile(this.patternsPath, JSON.stringify(this.patterns, null, 2));
  }

  /**
   * Save lessons to disk
   */
  private async saveLessons(): Promise<void> {
    await writeFile(this.lessonsPath, JSON.stringify(this.lessons, null, 2));
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    totalVectors: number;
    totalPatterns: number;
    totalLessons: number;
    vectorsByType: Record<string, number>;
    topTechniques: Array<{ technique: string; count: number }>;
  } {
    const byType = new Map<string, number>();
    const techniqueCounts = new Map<string, number>();

    this.vectors.forEach(v => {
      byType.set(v.metadata.type, (byType.get(v.metadata.type) || 0) + 1);
      v.metadata.mitreTechniques?.forEach(t => 
        techniqueCounts.set(t, (techniqueCounts.get(t) || 0) + 1)
      );
    });

    return {
      totalVectors: this.vectors.length,
      totalPatterns: this.patterns.length,
      totalLessons: this.lessons.length,
      vectorsByType: Object.fromEntries(byType),
      topTechniques: Array.from(techniqueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([technique, count]) => ({ technique, count }))
    };
  }
}

export default VectorMemoryEngine;
