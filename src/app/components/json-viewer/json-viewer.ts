import { Component, input, effect, viewChild, ElementRef, output } from '@angular/core';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-tomorrow.css';

@Component({
  selector: 'app-json-viewer',
  imports: [],
  template: `
    <div class="editor-container">
      <pre 
        #editableElement
        class="language-json m-0" 
        contenteditable="true"
        (input)="onContentChange($event)"
        (paste)="onPaste($event)"><code #codeElement class="language-json">{{ formattedJson() }}</code></pre>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }
    
    .editor-container {
      height: 100%;
      overflow: auto;
      background: #1d1f21; /* Add dark background */
    }
    
    pre {
      height: 100%;
      padding: 0.75rem;
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      outline: none;
      min-height: 100%;
      background: #1d1f21 !important; /* Force dark background */
      
      &:focus {
        outline: none;
      }
    }
    
    code {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      white-space: pre-wrap;
      word-wrap: break-word;
      background: transparent !important; /* Don't override text background */
    }
    
    /* Ensure Prism colors are visible on dark background */
    :host ::ng-deep {
      .token.property {
        color: #9cdcfe !important;
      }
      
      .token.string {
        color: #ce9178 !important;
      }
      
      .token.number {
        color: #b5cea8 !important;
      }
      
      .token.boolean,
      .token.null {
        color: #569cd6 !important;
      }
      
      .token.punctuation {
        color: #d4d4d4 !important;
      }
      
      .token.comment {
        color: #6a9955 !important;
      }
    }
  `]
})
export class JsonViewer {
  jsonContent = input<string>('');
  jsonChange = output<string>();
  
  codeElement = viewChild<ElementRef>('codeElement');
  editableElement = viewChild<ElementRef>('editableElement');
  
  protected formattedJson = (): string => {
    const content = this.jsonContent();
    if (!content.trim()) return '';
    
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return content;
    }
  };
  
  constructor() {
    effect(() => {
      this.jsonContent();
      setTimeout(() => this.highlightCode(), 0);
    });
  }
  
  private highlightCode(): void {
    const element = this.codeElement()?.nativeElement;
    if (element) {
      Prism.highlightElement(element);
    }
  }
  
  protected onContentChange(event: Event): void {
    const element = event.target as HTMLElement;
    const text = element.innerText;
    this.jsonChange.emit(text);
  }
  
  protected onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    
    // Insert as plain text
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    
    selection.deleteFromDocument();
    selection.getRangeAt(0).insertNode(document.createTextNode(text));
    
    // Move cursor to end
    selection.collapseToEnd();
    
    this.jsonChange.emit(text);
  }
}