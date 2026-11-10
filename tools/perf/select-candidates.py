#!/usr/bin/env python3
"""Create a deterministic candidate order; keep corpus text in an ignored local directory."""
import argparse
import hashlib
import heapq
import json
from pathlib import Path
import subprocess


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--seed", default="mermaid-flowchart-perf-2026-11-10-v1")
    parser.add_argument("--count", type=int, default=20000)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    out = args.out.resolve()
    # Source-bearing artifacts must remain ignored, even if the caller chooses a new path.
    if out == repo or repo in out.parents:
        probe = out / "candidates.jsonl"
        if subprocess.run(["git", "check-ignore", "-q", str(probe)], cwd=repo).returncode:
            parser.error("output inside the repository must be Git-ignored")
    if args.count < 1:
        parser.error("count must be positive")
    if out.exists() and any(out.iterdir()):
        parser.error("output directory must be new or empty; use a new path to preserve evidence")
    shards = []
    total = 0
    files = sorted(args.corpus.glob("flowchart-*.jsonl"))
    if not files:
        parser.error("no flowchart shards found")
    for path in files:
        digest = hashlib.sha256()
        count = 0
        with path.open("rb") as stream:
            for line in stream:
                digest.update(line)
                count += bool(line.strip())
        shards.append({"file": path.name, "records": count, "sha256": digest.hexdigest()})
        total += count
    if args.count > total:
        parser.error("candidate count exceeds corpus records")

    def rank(index):
        return hashlib.sha256(f"{args.seed}\0{index}".encode()).digest()

    # A hash-ranked ordering avoids dependence on a language's pseudo-random generator version.
    order = heapq.nsmallest(args.count, range(total), key=lambda i: (rank(i), i))
    wanted = set(order)
    records = {}
    ordinal = 0
    for path, shard in zip(files, shards):
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for line_number, line in enumerate(stream, 1):
                digest.update(line)
                if not line.strip():
                    continue
                if ordinal in wanted:
                    record = json.loads(line)
                    source = record.get("diagramCode")
                    if not isinstance(source, str):
                        raise ValueError(f"invalid diagramCode at {path.name}:{line_number}")
                    records[ordinal] = {
                        "ordinal": ordinal,
                        "file": path.name,
                        "line": line_number,
                        "id": record.get("id"),
                        "type": record.get("type"),
                        "sourceSha256": hashlib.sha256(source.encode()).hexdigest(),
                        "source": source,
                    }
                ordinal += 1
        if digest.hexdigest() != shard["sha256"]:
            raise RuntimeError("corpus changed during selection")
    if len(records) != args.count:
        raise RuntimeError("candidate selection incomplete")
    out.mkdir(parents=True, exist_ok=True)
    candidates = b"".join(encoded(records[index]) for index in order)
    (out / "candidates.jsonl").write_bytes(candidates)
    provenance = {
        "schema": 1,
        "algorithm": "ascending SHA256(UTF8(seed + NUL + decimal zero-based nonempty-record ordinal)); ordinal tie-break",
        "seed": args.seed,
        "corpus": str(args.corpus.resolve()),
        "corpusRecords": total,
        "shards": shards,
        "candidates": args.count,
        "candidatesSha256": hashlib.sha256(candidates).hexdigest(),
    }
    (out / "provenance.json").write_bytes(encoded(provenance))
    print(json.dumps({k: v for k, v in provenance.items() if k not in ("shards", "corpus")}))


if __name__ == "__main__":
    main()
