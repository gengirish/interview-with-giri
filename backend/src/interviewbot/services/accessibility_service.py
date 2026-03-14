"""Accessibility service for interview accommodations."""


def get_time_multiplier(config: dict | None) -> float:
    """Get time multiplier from accessibility config."""
    prefs = config.get("preferences", {}) if config else {}
    if prefs.get("extended_time"):
        return prefs.get("time_multiplier", 1.5)
    return 1.0


def get_css_overrides(config: dict | None) -> dict[str, str]:
    """Generate CSS custom property overrides for accessibility modes."""
    prefs = config.get("preferences", {}) if config else {}
    overrides: dict[str, str] = {}

    if prefs.get("high_contrast"):
        overrides.update({
            "--bg-primary": "#000000",
            "--bg-secondary": "#1a1a1a",
            "--text-primary": "#FFFFFF",
            "--text-secondary": "#E0E0E0",
            "--accent-primary": "#FFFF00",
            "--accent-secondary": "#00FFFF",
            "--border-color": "#FFFFFF",
            "--border-width": "2px",
            "--focus-ring": "3px solid #FFFF00",
        })

    if prefs.get("large_text"):
        overrides.update({
            "--font-size-base": "20px",
            "--font-size-lg": "24px",
            "--font-size-xl": "28px",
            "--input-height": "56px",
            "--button-padding": "16px 24px",
        })

    if prefs.get("dyslexia_friendly_font"):
        overrides.update({
            "--font-family": "'OpenDyslexic', 'Comic Sans MS', sans-serif",
            "--letter-spacing": "0.05em",
            "--word-spacing": "0.1em",
            "--line-height": "1.8",
        })

    if prefs.get("reduced_motion"):
        overrides.update({
            "--transition-duration": "0s",
            "--animation-duration": "0s",
        })

    return overrides


def format_for_screen_reader(
    question_text: str, question_number: int, total_questions: int
) -> str:
    """Format question text for screen reader accessibility."""
    return f"Question {question_number} of {total_questions}: {question_text}"


def get_scoring_adjustments(config: dict | None) -> dict[str, bool]:
    """Return scoring adjustments to ensure fairness for accommodated candidates."""
    prefs = config.get("preferences", {}) if config else {}
    adjustments: dict[str, bool] = {}
    if prefs.get("extended_time"):
        adjustments["ignore_response_time"] = True
    if prefs.get("screen_reader_optimized"):
        adjustments["ignore_formatting"] = True
    return adjustments
