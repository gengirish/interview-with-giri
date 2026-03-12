export interface DimensionalScore {
  score: number | null;
  evidence: string;
  notes: string;
}

export interface SWEScorecard {
  technical_scores: Record<string, DimensionalScore>;
  behavioral_scores: Record<string, DimensionalScore>;
  overall_score: number;
  confidence_score: number;
  experience_level_assessment: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendation: string;
  suggested_follow_up_areas: string[];
  hiring_level_fit: string;
}

export interface BehaviorSummary {
  total_keystrokes: number;
  total_pastes: number;
  total_paste_chars: number;
  tab_switches: number;
  total_away_time_ms: number;
  focus_losses: number;
  avg_typing_speed_wpm: number;
  longest_idle_ms: number;
  code_submissions: number;
  integrity_score: number;
  flags: string[];
}

export interface IntegrityAssessment {
  integrity_score: number;
  risk_level: "low" | "medium" | "high";
  flags: string[];
  summary: string;
  details: BehaviorSummary;
}

export interface TimelinePoint {
  time: string;
  keystrokes: number;
  pastes: number;
  tab_switches: number;
}
