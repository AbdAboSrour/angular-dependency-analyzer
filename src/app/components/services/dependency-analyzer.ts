import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import { NpmRegistryService } from './npm-registry';

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: { [key: string]: string };
  devDependencies?: { [key: string]: string };
  [key: string]: any; // Allow any additional properties like scripts, description, etc.
}

export interface DependencyAnalysis {
  name: string;
  currentVersion: string;
  latestVersion: string;
  recommendedVersion: string;
  isAngularPackage: boolean;
  needsUpdate: boolean;
  risk: 'low' | 'medium' | 'high';
  notes: string;
}

export interface AnalysisResult {
  original: PackageJson;
  updated: PackageJson;
  analysis: DependencyAnalysis[];
  summary: {
    total: number;
    needsUpdate: number;
    lowRisk: number;
    mediumRisk: number;
    highRisk: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class DependencyAnalyzerService {
  private readonly npmRegistry = inject(NpmRegistryService);

  /**
   * Analyze a package.json and return upgrade recommendations
   */
  analyze(packageJson: PackageJson, targetAngularVersion: string): Observable<AnalysisResult> {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    const depNames = Object.keys(allDeps);

    if (depNames.length === 0) {
      return of(this.createEmptyResult(packageJson));
    }

    // Fetch info for all dependencies in parallel
    const requests = depNames.map(name =>
      this.analyzeDependency(name, allDeps[name], targetAngularVersion)
    );

    return forkJoin(requests).pipe(
      map(analyses => this.buildResult(packageJson, analyses))
    );
  }

  /**
   * Analyze a single dependency
   */
  private analyzeDependency(
    name: string,
    currentVersion: string,
    targetAngularVersion: string
  ): Observable<DependencyAnalysis> {
    const cleanVersion = this.cleanVersion(currentVersion);
    
    // Use intelligent version resolution from NPM registry
    return this.npmRegistry.getBestVersion(name, targetAngularVersion, currentVersion).pipe(
      map(bestVersion => {
        const recommendedVersion = bestVersion || cleanVersion;
        const isAngularPackage = this.isAngularPackage(name);
        
        // Determine risk level
        let risk: 'low' | 'medium' | 'high' = 'low';
        if (this.isAngularEcosystemPackage(name)) {
          risk = 'medium';
        }
        
        // Determine notes based on comparison
        let notes = '';
        const comparison = this.compareVersions(cleanVersion, recommendedVersion);
        
        if (comparison < 0) {
          // Upgrade available
          if (isAngularPackage) {
            notes = `Upgrade to match Angular ${targetAngularVersion}`;
          } else if (this.isAngularEcosystemPackage(name)) {
            notes = `Update available - verify compatibility with Angular ${targetAngularVersion}`;
          } else {
            notes = `Update available`;
          }
        } else if (comparison === 0) {
          // Already on recommended version
          notes = isAngularPackage 
            ? `Aligned with Angular ${targetAngularVersion}` 
            : 'Up to date';
        } else {
          // Current is newer than recommended (shouldn't happen with good logic)
          notes = 'Current version is newer';
        }
        
        const needsUpdate = comparison < 0;
        
        // Get latest version for reference
        const latestVersion = recommendedVersion; // Best version is effectively our "latest recommended"

        return {
          name,
          currentVersion: cleanVersion,
          latestVersion,
          recommendedVersion,
          isAngularPackage,
          needsUpdate,
          risk,
          notes
        };
      })
    );
  }

  /**
   * Check if package is an Angular core package
   */
  private isAngularPackage(name: string): boolean {
    return name.startsWith('@angular/') && !name.includes('material') && !name.includes('cdk');
  }

  /**
   * Check if package is part of Angular ecosystem
   */
  private isAngularEcosystemPackage(name: string): boolean {
    return name.startsWith('ng-') ||
      name.startsWith('ngx-') ||
      name.startsWith('@ng-') ||
      name.includes('@angular/material') ||
      name.includes('@angular/cdk') ||
      name.includes('@ngrx/');
  }

  /**
   * Clean version string (remove ^, ~, etc.)
   */
  private cleanVersion(version: string): string {
    return version.replace(/[\^~>=<]/g, '');
  }

  /**
   * Compare two version strings
   * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  }

  /**
   * Build the final analysis result
   */
  private buildResult(original: PackageJson, analyses: DependencyAnalysis[]): AnalysisResult {
    const updatedDeps: { [key: string]: string } = {};
    const updatedDevDeps: { [key: string]: string } = {};

    analyses.forEach(analysis => {
      const newVersion = `^${analysis.recommendedVersion}`;

      if (original.dependencies?.[analysis.name]) {
        updatedDeps[analysis.name] = newVersion;
      }

      if (original.devDependencies?.[analysis.name]) {
        updatedDevDeps[analysis.name] = newVersion;
      }
    });

    const updated: PackageJson = {
      ...original,
      dependencies: Object.keys(updatedDeps).length > 0 ? updatedDeps : original.dependencies,
      devDependencies: Object.keys(updatedDevDeps).length > 0 ? updatedDevDeps : original.devDependencies
    };

    const summary = {
      total: analyses.length,
      needsUpdate: analyses.filter(a => a.needsUpdate).length,
      lowRisk: analyses.filter(a => a.risk === 'low').length,
      mediumRisk: analyses.filter(a => a.risk === 'medium').length,
      highRisk: analyses.filter(a => a.risk === 'high').length
    };

    return { original, updated, analysis: analyses, summary };
  }

  /**
   * Create empty result for packages with no dependencies
   */
  private createEmptyResult(packageJson: PackageJson): AnalysisResult {
    return {
      original: packageJson,
      updated: packageJson,
      analysis: [],
      summary: {
        total: 0,
        needsUpdate: 0,
        lowRisk: 0,
        mediumRisk: 0,
        highRisk: 0
      }
    };
  }
}