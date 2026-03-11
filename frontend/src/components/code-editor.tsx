"use client";

import { useState, useCallback } from "react";
import { Play, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface CodeEditorProps {
  initialCode?: string;
  language?: string;
  onSubmit?: (code: string, result: CodeResult) => void;
  readOnly?: boolean;
  className?: string;
}

interface CodeResult {
  stdout: string;
  stderr: string;
  compile_output: string;
  status: string;
  time: string | null;
  memory: number | null;
}

const LANGUAGE_TEMPLATES: Record<string, string> = {
  python: '# Write your solution here\ndef solution():\n    pass\n\nsolution()\n',
  javascript: '// Write your solution here\nfunction solution() {\n  \n}\n\nsolution();\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
  "c++": '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n    fmt.Println("Hello")\n}\n',
  rust: 'fn main() {\n    // Write your solution here\n    println!("Hello");\n}\n',
};

const LANGUAGES = ["python", "javascript", "java", "c++", "go", "rust", "typescript"];

export function CodeEditor({
  initialCode,
  language: defaultLang = "python",
  onSubmit,
  readOnly = false,
  className,
}: CodeEditorProps) {
  const [code, setCode] = useState(initialCode || LANGUAGE_TEMPLATES[defaultLang] || "");
  const [language, setLanguage] = useState(defaultLang);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [executionTime, setExecutionTime] = useState<string | null>(null);

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      setLanguage(newLang);
      if (!code || code === LANGUAGE_TEMPLATES[language]) {
        setCode(LANGUAGE_TEMPLATES[newLang] || "");
      }
    },
    [code, language],
  );

  async function runCode() {
    setRunning(true);
    setOutput("");
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/api/v1/code/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: code,
          language,
          stdin: "",
          timeout: 10,
        }),
      });
      const result: CodeResult = await res.json();

      const outputParts: string[] = [];
      if (result.compile_output) outputParts.push(`Compilation:\n${result.compile_output}`);
      if (result.stdout) outputParts.push(result.stdout);
      if (result.stderr) outputParts.push(`Error:\n${result.stderr}`);
      if (!outputParts.length) outputParts.push("(no output)");

      setOutput(outputParts.join("\n\n"));
      setStatus(result.status);
      setExecutionTime(result.time);

      onSubmit?.(code, result);
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

  return (
    <div className={cn("flex flex-col rounded-xl border border-slate-700 bg-slate-900 overflow-hidden", className)}>
      {/* Toolbar */}
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
            <span className="text-xs text-slate-500">
              {executionTime}s
            </span>
          )}
          {status && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                status === "Accepted"
                  ? "bg-green-900/50 text-green-400"
                  : "bg-red-900/50 text-red-400",
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
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={runCode}
            disabled={running || readOnly}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-[300px]">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          readOnly={readOnly}
          spellCheck={false}
          className="h-full w-full resize-none bg-slate-950 p-4 font-mono text-sm text-slate-200 focus:outline-none"
          style={{ tabSize: 2, minHeight: "300px" }}
        />
      </div>

      {/* Output */}
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
