"""Input validation and prompt injection detection."""
import re

_JD_INJECTION_PATTERNS = [
    r"ignore\s+(previous|above|all)\s+instructions?",
    r"disregard.*system\s+prompt",
    r"\byou\s+are\s+now\b",
    r"\bnew\s+persona\b",
    r"\bjailbreak\b",
    r"\bdo\s+anything\s+now\b",
    r"repeat\s+(your|the)\s+(system|instructions?|prompt)",
    r"what\s+(are|were)\s+your\s+instructions?",
    r"print\s+(your|the)\s+(system|prompt)",
    r"<\|.*\|>",
    r"\[INST\]",
    r"<<SYS>>",
]

_TEX_INJECTION_PATTERNS = [
    r"ignore\s+(previous|above|all)\s+instructions?",
    r"disregard.*system",
    r"\byou\s+are\s+now\b",
    r"\bnew\s+persona\b",
    r"\bjailbreak\b",
    r"\[INST\]",
    r"<<SYS>>",
    r"<\|.*\|>",
]

_JD_COMPILED = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in _JD_INJECTION_PATTERNS]
_TEX_COMPILED = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in _TEX_INJECTION_PATTERNS]

_PROMPT_ROLE_LINE = re.compile(r"^(Human|Assistant|System|User)\s*:", re.MULTILINE)
_XML_TAGS = re.compile(r"<[a-z]+>.*?</[a-z]+>", re.DOTALL | re.IGNORECASE)
_SHELL_ESCAPE = re.compile(r"\\write18|\\input\{[./]", re.IGNORECASE)


def check_jd(text: str) -> str | None:
    """Return a reason string if the JD text looks like a prompt injection, else None."""
    for pattern in _JD_COMPILED:
        if pattern.search(text):
            return "jd_injection_pattern"
    return None


def check_tex(tex: str) -> str | None:
    """Return a reason string if the .tex source looks suspicious, else None."""
    if _SHELL_ESCAPE.search(tex):
        return "shell_escape_detected"

    lines = tex.splitlines()
    if not lines:
        return None

    comment_lines = sum(1 for l in lines if l.strip().startswith("%") and not l.strip().startswith("%%"))
    if len(lines) > 10 and comment_lines / len(lines) > 0.4:
        return "excessive_comment_ratio"

    for pattern in _TEX_COMPILED:
        for line in lines:
            if line.strip().startswith("%") and pattern.search(line):
                return "injection_in_comment"

    if _PROMPT_ROLE_LINE.search(tex):
        return "prompt_role_marker"

    if _XML_TAGS.search(tex):
        return "xml_tags_in_tex"

    return None
