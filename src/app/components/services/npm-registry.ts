import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';

export interface NpmPackageInfo {
  name: string;
  versions: { [version: string]: any };
  'dist-tags': { latest: string };
  time: { [version: string]: string };
}

@Injectable({
  providedIn: 'root'
})
export class NpmRegistryService {
  private readonly http = inject(HttpClient);
  private readonly NPM_REGISTRY = 'https://registry.npmjs.org';
  
  /**
   * Fetch package information from NPM registry
   */
  getPackageInfo(packageName: string): Observable<NpmPackageInfo | null> {
    return this.http.get<NpmPackageInfo>(`${this.NPM_REGISTRY}/${packageName}`).pipe(
      catchError(error => {
        console.error(`Failed to fetch package: ${packageName}`, error);
        return of(null);
      })
    );
  }
  
  /**
   * Get the latest version of a package
   */
  getLatestVersion(packageName: string): Observable<string | null> {
    return this.getPackageInfo(packageName).pipe(
      map(info => info?.['dist-tags']?.latest || null)
    );
  }
  
  /**
   * Get all available versions of a package
   */
  getAllVersions(packageName: string): Observable<string[]> {
    return this.getPackageInfo(packageName).pipe(
      map(info => info ? Object.keys(info.versions) : [])
    );
  }
  
  /**
   * Check if a package exists
   */
  packageExists(packageName: string): Observable<boolean> {
    return this.getPackageInfo(packageName).pipe(
      map(info => info !== null)
    );
  }
  
  /**
   * Get the best compatible version for a package based on constraints
   * @param packageName The package to check
   * @param targetAngularVersion The target Angular version (e.g., "19")
   * @param currentVersion The current version (to avoid downgrades)
   */
  getBestVersion(packageName: string, targetAngularVersion: string, currentVersion: string): Observable<string | null> {
    return this.getPackageInfo(packageName).pipe(
      map(info => {
        if (!info) return null;
        
        const versions = Object.keys(info.versions);
        const cleanCurrent = this.cleanVersion(currentVersion);
        const isCurrentPreRelease = this.isPreReleaseVersion(cleanCurrent);
        
        // For Angular core packages, find best version matching target major
        if (packageName.startsWith('@angular/') && !packageName.includes('material') && !packageName.includes('cdk')) {
          return this.findBestAngularVersion(versions, targetAngularVersion, cleanCurrent);
        }
        
        // For other packages, check peerDependencies for Angular compatibility
        const compatibleVersions = this.findVersionsCompatibleWithAngular(info, targetAngularVersion, isCurrentPreRelease);
        
        if (compatibleVersions.length > 0) {
          // Sort versions and get the latest compatible one that doesn't downgrade
          const sorted = this.sortVersionsDescending(compatibleVersions);
          for (const version of sorted) {
            if (this.compareVersions(version, cleanCurrent) >= 0) {
              return version;
            }
          }
        }
        
        // Fallback: use latest stable if no downgrades, or keep current
        let latest = info['dist-tags']?.latest || cleanCurrent;
        
        // If latest is pre-release but current is stable, try to find a stable version
        if (!isCurrentPreRelease && this.isPreReleaseVersion(latest)) {
          const stableVersions = versions.filter(v => !this.isPreReleaseVersion(v));
          if (stableVersions.length > 0) {
            const sorted = this.sortVersionsDescending(stableVersions);
            latest = sorted[0];
          }
        }
        
        return this.compareVersions(latest, cleanCurrent) >= 0 ? latest : cleanCurrent;
      })
    );
  }
  
  /**
   * Find best Angular version matching target major
   */
  private findBestAngularVersion(versions: string[], targetAngularVersion: string, currentVersion: string): string {
    const targetMajor = parseInt(targetAngularVersion, 10);
    const currentMajor = parseInt(currentVersion.split('.')[0], 10);
    const isCurrentPreRelease = this.isPreReleaseVersion(currentVersion);
    
    // Filter versions matching target major
    let targetMajorVersions = versions.filter(v => {
      const major = parseInt(v.split('.')[0], 10);
      return major === targetMajor;
    });
    
    // Filter out pre-release versions unless current is already pre-release
    if (!isCurrentPreRelease) {
      const stableVersions = targetMajorVersions.filter(v => !this.isPreReleaseVersion(v));
      if (stableVersions.length > 0) {
        targetMajorVersions = stableVersions;
      }
    }
    
    if (targetMajorVersions.length > 0) {
      // Return latest stable version of target major
      const sorted = this.sortVersionsDescending(targetMajorVersions);
      return sorted[0];
    }
    
    // If current is higher than target, keep current
    if (currentMajor > targetMajor) {
      return currentVersion;
    }
    
    // Fallback to target.0.0
    return `${targetAngularVersion}.0.0`;
  }
  
  /**
   * Check if a version is a pre-release (canary, beta, rc, alpha, next)
   */
  private isPreReleaseVersion(version: string): boolean {
    const preReleasePatterns = [
      'canary', 'beta', 'rc', 'alpha', 'next', 'dev', 
      'snapshot', 'preview', 'experimental'
    ];
    const lowerVersion = version.toLowerCase();
    return preReleasePatterns.some(pattern => lowerVersion.includes(pattern));
  }
  
  /**
   * Find versions compatible with target Angular version by checking peerDependencies
   */
  private findVersionsCompatibleWithAngular(info: NpmPackageInfo, targetAngularVersion: string, includePreRelease: boolean = false): string[] {
    const compatible: string[] = [];
    const targetMajor = parseInt(targetAngularVersion, 10);
    
    Object.entries(info.versions).forEach(([version, versionData]) => {
      // Skip pre-release versions unless explicitly included
      if (!includePreRelease && this.isPreReleaseVersion(version)) {
        return;
      }
      
      const peerDeps = versionData.peerDependencies;
      
      if (!peerDeps) {
        // No peer dependencies - consider compatible
        compatible.push(version);
        return;
      }
      
      // Check if Angular core is in peer dependencies
      const angularPeer = peerDeps['@angular/core'];
      if (!angularPeer) {
        // No Angular peer dependency - consider compatible
        compatible.push(version);
        return;
      }
      
      // Check if target Angular version satisfies the peer dependency
      if (this.versionSatisfiesPeerDep(targetMajor, angularPeer)) {
        compatible.push(version);
      }
    });
    
    return compatible;
  }
  
  /**
   * Check if target Angular version satisfies peer dependency constraint
   */
  private versionSatisfiesPeerDep(targetMajor: number, peerDepConstraint: string): boolean {
    // Handle common patterns: "^17.0.0", ">=16.0.0", "^16.0.0 || ^17.0.0"
    const patterns = peerDepConstraint.split('||').map(p => p.trim());
    
    for (const pattern of patterns) {
      // Extract version numbers
      const match = pattern.match(/(\d+)/);
      if (!match) continue;
      
      const constraintMajor = parseInt(match[1], 10);
      
      if (pattern.includes('>=')) {
        if (targetMajor >= constraintMajor) return true;
      } else if (pattern.includes('^')) {
        if (targetMajor === constraintMajor) return true;
      } else if (pattern.includes('~')) {
        if (targetMajor === constraintMajor) return true;
      }
    }
    
    return false;
  }
  
  /**
   * Sort versions in descending order (latest first)
   */
  private sortVersionsDescending(versions: string[]): string[] {
    return versions.sort((a, b) => this.compareVersions(b, a));
  }
  
  /**
   * Compare two version strings
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(p => parseInt(p, 10) || 0);
    const parts2 = v2.split('.').map(p => parseInt(p, 10) || 0);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    
    return 0;
  }
  
  /**
   * Clean version string (remove ^, ~, etc.)
   */
  private cleanVersion(version: string): string {
    return version.replace(/[\^~>=<]/g, '');
  }
}