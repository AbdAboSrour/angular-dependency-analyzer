import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from "./components/header/header";
import { JsonViewer } from "./components/json-viewer/json-viewer";
import { inject } from '@angular/core';
import { DependencyAnalyzerService, AnalysisResult, DependencyAnalysis } from './components/services/dependency-analyzer';

@Component({
  selector: 'app-root',
  imports: [Header, JsonViewer],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly analyzerService = inject(DependencyAnalyzerService);
  
  protected readonly title = signal('angular-dependency-analyzer');
  
  // Signals for editor content
  protected inputJson = signal('');
  protected outputJson = signal('');
  protected selectedVersion = signal('17');
  protected isAnalyzing = signal(false);
  protected analysisResult = signal<AnalysisResult | null>(null);
  
  // Calculate line count
  protected get inputLineCount(): number {
    return this.inputJson().split('\n').length;
  }
  
  // Get JSON with comments showing changes
  protected getAnnotatedJson(): string {
    const result = this.analysisResult();
    if (!result) return this.outputJson();
    
    const updated = result.updated;
    const lines: string[] = [];
    const allKeys = Object.keys(updated);
    const lastKeyIndex = allKeys.length - 1;
    
    lines.push('{');
    
    allKeys.forEach((key, keyIndex) => {
      const value = updated[key];
      const isLastKey = keyIndex === lastKeyIndex;
      const keyComma = isLastKey ? '' : ',';
      
      // Special handling for dependencies and devDependencies with annotations
      if (key === 'dependencies' || key === 'devDependencies') {
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
          lines.push(`  "${key}": {`);
          
          const deps = Object.entries(value);
          deps.forEach(([name, version], index) => {
            const analysis = result.analysis.find(a => a.name === name);
            const isLast = index === deps.length - 1;
            const comma = isLast ? '' : ',';
            
            if (analysis?.needsUpdate) {
              lines.push(`    "${name}": "${version}"${comma} // ⬆️ ${analysis.currentVersion} → ${analysis.recommendedVersion}`);
            } else {
              lines.push(`    "${name}": "${version}"${comma}`);
            }
          });
          
          lines.push(`  }${keyComma}`);
        }
      } 
      // Handle all other fields (scripts, description, author, etc.)
      else {
        const jsonValue = JSON.stringify(value, null, 2);
        if (jsonValue.includes('\n')) {
          // Multi-line object or array
          const indentedValue = jsonValue.split('\n').map((line, idx) => 
            idx === 0 ? line : `  ${line}`
          ).join('\n');
          lines.push(`  "${key}": ${indentedValue}${keyComma}`);
        } else {
          // Single-line value
          lines.push(`  "${key}": ${jsonValue}${keyComma}`);
        }
      }
    });
    
    lines.push('}');
    
    return lines.join('\n');
  }
  
  // Paste from clipboard
  protected async onPaste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      this.inputJson.set(text);
    } catch (error) {
      alert('Failed to read from clipboard. Please paste manually.');
    }
  }
  
  // Copy to clipboard
  protected async onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.outputJson());
      alert('✅ Copied to clipboard!');
    } catch (error) {
      alert('❌ Failed to copy to clipboard.');
    }
  }
  
  // Clear input
  protected onClear(): void {
    this.inputJson.set('');
  }
  
  // Reset everything
  protected onReset(): void {
    this.inputJson.set('');
    this.outputJson.set('');
    this.selectedVersion.set('17');
    this.analysisResult.set(null);
    this.isAnalyzing.set(false);
  }
  
  // Download as file
  protected onDownload(): void {
    if (!this.outputJson()) {
      alert('⚠️ Nothing to download yet!');
      return;
    }
    
    const blob = new Blob([this.outputJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'package-updated.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  
  // Analyze dependencies
  protected onAnalyze(): void {
    if (!this.inputJson().trim()) {
      alert('⚠️ Please paste your package.json first!');
      return;
    }
    
    try {
      // Validate and parse JSON
      const packageJson = JSON.parse(this.inputJson());
      
      // Check if it's a valid package.json
      if (!packageJson.name && !packageJson.dependencies && !packageJson.devDependencies) {
        alert('⚠️ This doesn\'t look like a valid package.json file');
        return;
      }
      
      // Check current Angular version vs target
      const currentAngularVersion = this.getCurrentAngularVersion(packageJson);
      const targetVersion = parseInt(this.selectedVersion());
      
      if (currentAngularVersion && currentAngularVersion > targetVersion) {
        alert(`ℹ️ Your project is using Angular ${currentAngularVersion}, which is newer than the selected target (Angular ${targetVersion}).\n\nNo downgrade needed - your dependencies are already up to date!`);
        return;
      }
      
      // Start analyzing
      this.isAnalyzing.set(true);
      
      this.analyzerService.analyze(packageJson, this.selectedVersion()).subscribe({
        next: (result) => {
          this.analysisResult.set(result);
          this.outputJson.set(JSON.stringify(result.updated, null, 2));
          this.isAnalyzing.set(false);
        },
        error: (error) => {
          console.error('Analysis failed:', error);
          alert('❌ Analysis failed. Please check console for details.');
          this.isAnalyzing.set(false);
        }
      });
      
    } catch (error) {
      alert('❌ Invalid JSON format. Please check your package.json');
    }
  }
  
  // Get current Angular version from package.json
  private getCurrentAngularVersion(packageJson: any): number | null {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };
    
    // Look for @angular/core
    const coreVersion = allDeps['@angular/core'];
    if (!coreVersion) return null;
    
    // Extract major version number (e.g., "^19.1.3" -> 19)
    const match = coreVersion.match(/(\d+)\./);
    return match ? parseInt(match[1], 10) : null;
  }
  
  // Handle input change from editable viewer
  protected onInputChange(content: string): void {
    this.inputJson.set(content);
  }
  
  // Handle version change
  protected onVersionChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedVersion.set(select.value);
  }
  
  // Get packages by risk level
  protected getPackagesByRisk(risk: 'low' | 'medium' | 'high'): DependencyAnalysis[] {
    const result = this.analysisResult();
    if (!result) return [];
    return result.analysis.filter(pkg => pkg.risk === risk);
  }
  
  // Get packages by update status
  protected getPackagesByUpdateStatus(needsUpdate: boolean): DependencyAnalysis[] {
    const result = this.analysisResult();
    if (!result) return [];
    return result.analysis.filter(pkg => pkg.needsUpdate === needsUpdate);
  }
}