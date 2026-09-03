#!/usr/bin/env python3
"""
Merge YouTube auto-generated .vtt caption files into one clean transcript document.

Expects files produced by:
  yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt \
    --dateafter 20260601 \
    -o "%(upload_date)s_%(title)s.%(ext)s" \
    "https://www.youtube.com/@vaibhavsisinty/videos"

which yields filenames like: 20260615_My Video Title.en.vtt
"""

import argparse
import re
import sys
from pathlib import Path

CHANNEL_HANDLE = "@vaibhavsisinty"
CHANNEL_URL = f"https://www.youtube.com/{CHANNEL_HANDLE}"
OUTPUT_NAME = "vaibhav_sisinty_transcripts_june_to_sept_2026.txt"

FILENAME_RE = re.compile(r"^(\d{8})_(.+)\.\w{2,3}\.vtt$")
TIME_LINE_RE = re.compile(r"^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->")
TAG_RE = re.compile(r"<[^>]+>")


def parse_filename(filename: str):
    m = FILENAME_RE.match(filename)
    if not m:
        return None
    date_str, title = m.group(1), m.group(2)
    return date_str, title


def format_date(date_str: str) -> str:
    return f"{date_str[0:4]}-{date_str[4:6]}-{date_str[6:8]}"


def parse_vtt_cues(path: Path):
    """Return a list of cue text strings (tags/timestamps stripped)."""
    raw = path.read_text(encoding="utf-8", errors="ignore")
    blocks = re.split(r"\n\s*\n", raw)
    cues = []
    for block in blocks:
        lines = [l for l in block.splitlines() if l.strip()]
        text_lines = []
        started = False
        for line in lines:
            if TIME_LINE_RE.match(line.strip()):
                started = True
                continue
            if started:
                cleaned = TAG_RE.sub("", line).strip()
                if cleaned:
                    text_lines.append(cleaned)
        if text_lines:
            cues.append(" ".join(text_lines))
    return cues


def merge_cues(cues):
    """
    YouTube auto-captions "roll": each cue repeats the tail of the previous
    cue plus a few new words. Deduplicate by finding the longest overlap
    between the accumulated word tail and the start of each new cue.
    """
    acc = []
    for cue in cues:
        words = cue.split()
        if not words:
            continue
        max_k = min(len(acc), len(words), 20)
        best_k = 0
        for k in range(max_k, 0, -1):
            if acc[-k:] == words[:k]:
                best_k = k
                break
        acc.extend(words[best_k:])
    return " ".join(acc)


def to_paragraphs(text: str, words_per_paragraph: int = 90) -> str:
    words = text.split()
    paragraphs = []
    for i in range(0, len(words), words_per_paragraph):
        paragraphs.append(" ".join(words[i : i + words_per_paragraph]))
    return "\n\n".join(paragraphs)


def vtt_to_clean_text(path: Path) -> str:
    cues = parse_vtt_cues(path)
    merged = merge_cues(cues)
    merged = re.sub(r"\s+", " ", merged).strip()
    return to_paragraphs(merged)


def build_master_document(folder: Path) -> str:
    entries = []
    for f in sorted(folder.glob("*.vtt")):
        parsed = parse_filename(f.name)
        if not parsed:
            print(f"Skipping (unrecognized filename pattern): {f.name}", file=sys.stderr)
            continue
        date_str, title = parsed
        clean_text = vtt_to_clean_text(f)
        entries.append((date_str, title, clean_text))

    entries.sort(key=lambda e: (e[0], e[1]))

    parts = []
    for date_str, title, clean_text in entries:
        parts.append("=" * 80)
        parts.append(f"Title: {title}")
        parts.append(f"Upload Date: {format_date(date_str)}")
        parts.append(f"YouTube Channel: {CHANNEL_URL}")
        parts.append("=" * 80)
        parts.append("")
        parts.append(clean_text if clean_text else "[No caption text found]")
        parts.append("")
        parts.append("")

    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "folder",
        nargs="?",
        default=str(Path(__file__).parent),
        help="Folder containing .vtt files (default: this script's folder)",
    )
    args = parser.parse_args()
    folder = Path(args.folder)

    vtt_files = sorted(folder.glob("*.vtt"))
    if not vtt_files:
        print(f"No .vtt files found in {folder}", file=sys.stderr)
        sys.exit(1)

    doc = build_master_document(folder)
    out_path = folder / OUTPUT_NAME
    out_path.write_text(doc, encoding="utf-8")
    print(f"Merged {len(vtt_files)} caption file(s) into {out_path}")


if __name__ == "__main__":
    main()
