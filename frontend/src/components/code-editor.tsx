"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Play, Loader2, RotateCcw, AlertCircle, Send } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface BehaviorEvent {
  event_type:
    | "keystroke"
    | "paste"
    | "tab_switch"
    | "focus_loss"
    | "idle"
    | "code_submit";
  timestamp: string;
  data?: Record<string, unknown>;
}

interface CodeEditorProps {
  initialCode?: string;
  language?: string;
  interviewToken: string;
  /** Called when Submit Code is clicked. Sends code to chat for AI review. */
  onSubmitCode?: (code: string) => void;
  onBehaviorEvent?: (event: BehaviorEvent) => void;
  readOnly?: boolean;
  className?: string;
}

const LANGUAGE_TEMPLATES: Record<string, string> = {
  python:
    '# Write your solution here\ndef solution():\n    pass\n\nsolution()\n',
  javascript:
    '// Write your solution here\nfunction solution() {\n  \n}\n\nsolution();\n',
  typescript:
    '// Write your solution here\nfunction solution(): void {\n  \n}\n\nsolution();\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
  "c++":
    '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n    fmt.Println("Hello")\n}\n',
  rust: 'fn main() {\n    // Write your solution here\n    println!("Hello");\n}\n',
};

const LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "java",
  "c++",
  "go",
  "rust",
];

const MONACO_LANG_MAP: Record<string, string> = {
  python: "python",
  javascript: "javascript",
  typescript: "typescript",
  java: "java",
  "c++": "cpp",
  go: "go",
  rust: "rust",
};

const KEYS_PER_WORD = 5;
const KEYSTROKE_INTERVAL_MS = 5000;
const PASTE_WARNING_THRESHOLD = 50;

function emitCodeSubmit(
  onBehaviorEvent: CodeEditorProps["onBehaviorEvent"],
  language: string,
  code: string
) {
  if (!onBehaviorEvent) return;
  onBehaviorEvent({
    event_type: "code_submit",
    timestamp: new Date().toISOString(),
    data: {
      language,
      code_length: code.length,
      line_count: code.split("\n").length,
    },
  });
}

export function CodeEditor({
  initialCode,
  language: defaultLang = "python",
  interviewToken,
  onSubmitCode,
  onBehaviorEvent,
  readOnly = false,
  className,
}: CodeEditorProps) {
  const [code, setCode] = useState(
    initialCode || LANGUAGE_TEMPLATES[defaultLang] || ""
  );
  const [language, setLanguage] = useState(defaultLang);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [executionTime, setExecutionTime] = useState<string | null>(null);
  const [showPasteWarning, setShowPasteWarning] = useState(false);
  const pasteWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const charsTypedRef = useRef(0);
  const keystrokeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const intervalStartRef = useRef(Date.now());
  const ignoreNextContentChangeRef = useRef(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onBehaviorEventRef = useRef(onBehaviorEvent);
  const codeRef = useRef(code);
  const languageRef = useRef(language);

  onBehaviorEventRef.current = onBehaviorEvent;
  codeRef.current = code;
  languageRef.current = language;

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      setLanguage(newLang);
      if (!code || code === LANGUAGE_TEMPLATES[language]) {
        setCode(LANGUAGE_TEMPLATES[newLang] || "");
      }
    },
    [code, language]
  );

  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorRef.current = editorInstance;
      const model = editorInstance.getModel();
      if (!model) return;

      model.onDidChangeContent((e) => {
        if (ignoreNextContentChangeRef.current) {
          ignoreNextContentChangeRef.current = false;
          return;
        }
        const charsAdded = e.changes.reduce(
          (sum, change) => sum + (change.text?.length ?? 0),
          0
        );
        if (charsAdded > 0) {
          charsTypedRef.current += charsAdded;
        }
        codeRef.current = model.getValue();
      });

      editorInstance.onDidPaste((e) => {
        ignoreNextContentChangeRef.current = true;
        const contentLength =
          e.clipboardEvent?.clipboardData?.getData("text/plain")?.length ?? 0;
        onBehaviorEventRef.current?.({
          event_type: "paste",
          timestamp: new Date().toISOString(),
          data: { content_length: contentLength },
        });
        if (contentLength > PASTE_WARNING_THRESHOLD) {
          if (pasteWarningTimeoutRef.current) {
            clearTimeout(pasteWarningTimeoutRef.current);
          }
          setShowPasteWarning(true);
          pasteWarningTimeoutRef.current = setTimeout(
            () => setShowPasteWarning(false),
            3000
          );
        }
      });
    },
    []
  );

  useEffect(() => {
    keystrokeIntervalRef.current = setInterval(() => {
      const typed = charsTypedRef.current;
      if (typed > 0 && onBehaviorEventRef.current) {
        const durationMs = Date.now() - intervalStartRef.current;
        const wpm =
          durationMs > 0
            ? (typed / KEYS_PER_WORD) / (durationMs / 60000)
            : 0;
        onBehaviorEventRef.current({
          event_type: "keystroke",
          timestamp: new Date().toISOString(),
          data: {
            chars_typed: typed,
            duration_ms: durationMs,
            wpm: Math.round(wpm),
          },
        });
      }
      charsTypedRef.current = 0;
      intervalStartRef.current = Date.now();
    }, KEYSTROKE_INTERVAL_MS);

    return () => {
      if (keystrokeIntervalRef.current) {
        clearInterval(keystrokeIntervalRef.current);
        keystrokeIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pasteWarningTimeoutRef.current) {
        clearTimeout(pasteWarningTimeoutRef.current);
      }
    };
  }, []);

  async function runCode() {
    setRunning(true);
    setOutput("");
    setStatus("");
    try {
      const result = await api.executeCode(
        code,
        language,
        interviewToken,
        ""
      );

      const outputParts: string[] = [];
      if (result.compile_output)
        outputParts.push(`Compilation:\n${result.compile_output}`);
      if (result.stdout) outputParts.push(result.stdout);
      if (result.stderr) outputParts.push(`Error:\n${result.stderr}`);
      if (!outputParts.length) outputParts.push("(no output)");

      setOutput(outputParts.join("\n\n"));
      setStatus(result.status);
      setExecutionTime(result.time);

      emitCodeSubmit(onBehaviorEvent, language, code);
    } catch {
      setOutput("Failed to execute code. Check your connection.");
      setStatus("Error");
    } finally {
      setRunning(false);
    }
  }

  function resetCode() {
    setCode(LANGUAGE_TEMPLATES[language] || "");
    setOutput("");
    setStatus("");
  }

  const handleEditorChange = useCallback((value: string | undefined) => {
    setCode(value ?? "");
    codeRef.current = value ?? "";
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-slate-700 bg-slate-900 overflow-hidden",
        className
      )}
    >
      {showPasteWarning && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/30 text-amber-400 text-xs border-b border-amber-800/50">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Large paste detected. Ensure your work is original.</span>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={readOnly}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang.charAt(0).toUpperCase() + lang.slice(1)}
              </option>
            ))}
          </select>
          {executionTime && (
            <span className="text-xs text-slate-500">{executionTime}s</span>
          )}
          {status && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                status === "Accepted"
                  ? "bg-green-900/50 text-green-400"
                  : "bg-red-900/50 text-red-400"
              )}
            >
              {status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={resetCode}
            disabled={readOnly}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors disabled:opacity-50"
            title="Reset code"
            aria-label="Reset code"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={runCode}
            disabled={running || readOnly}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run
          </button>
          {onSubmitCode && (
            <button
              onClick={() => {
                emitCodeSubmit(onBehaviorEvent, language, code);
                onSubmitCode(code);
              }}
              disabled={readOnly}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              title="Submit code for review"
              aria-label="Submit code for review"
            >
              <Send className="h-3.5 w-3.5" />
              Submit Code
            </button>
          )}
        </div>
      </div>

      <div className="min-h-[400px] flex-1">
        <Editor
          height="400px"
          defaultLanguage={MONACO_LANG_MAP[language] ?? "plaintext"}
          language={MONACO_LANG_MAP[language] ?? "plaintext"}
          value={code}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "ui-monospace, monospace",
            tabSize: 2,
            scrollBeyondLastLine: false,
            padding: { top: 16 },
            automaticLayout: true,
          }}
          loading={
            <div className="flex h-[400px] items-center justify-center bg-slate-950 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          }
        />
      </div>

      {output && (
        <div className="border-t border-slate-700">
          <div className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/50">
            Output
          </div>
          <pre className="max-h-48 overflow-auto p-3 font-mono text-xs text-slate-300 whitespace-pre-wrap">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
