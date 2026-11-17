"""IBM Granite client. The AI explains and extracts; it never decides.

Providers, picked by the RECOUP_LLM environment variable:

* ``watsonx`` - IBM watsonx.ai (needs WATSONX_APIKEY, WATSONX_PROJECT_ID,
  optional WATSONX_URL and WATSONX_MODEL).
* ``ollama``  - a local Granite model through Ollama (OLLAMA_URL, OLLAMA_MODEL).
* ``none``    - default. No model; the templated explanations are used as is.

Every AI rewrite goes through ``numbers_preserved``: if the model drops or
invents a number, we throw its text away and show the template instead.
"""

from __future__ import annotations

import os
import re
import time

import httpx

from recoup.models import Finding

SYSTEM_EXPLAIN = (
    "You rewrite consumer-rights findings in plain English at a 6th-grade reading level. "
    "Keep every dollar amount, date, percent and number exactly as given. Do not add facts, "
    "do not give legal advice, do not say 'lawyer'. Two to three short sentences. "
    "Write to the person as 'you'."
)

SYSTEM_EXTRACT = (
    "You turn the text of a bill, estimate, insurance statement or lease into JSON. "
    "Only copy values that appear in the text; use null when a value is missing. "
    "Return JSON only, matching this shape: {schema}"
)

_NUMBER = re.compile(r"\$?\d[\d,]*(?:\.\d+)?%?")


def numbers_preserved(original: str, rewritten: str) -> bool:
    """True when the rewrite contains the same set of numbers as the original."""

    def norm(text: str) -> set[str]:
        return {n.replace("$", "").replace(",", "").rstrip("%").rstrip(".") for n in _NUMBER.findall(text)}

    return norm(original) == norm(rewritten)


class Granite:
    def __init__(self, provider: str | None = None) -> None:
        self.provider = (provider or os.getenv("RECOUP_LLM", "none")).lower()
        self._token: tuple[str, float] | None = None

    @property
    def enabled(self) -> bool:
        return self.provider in {"watsonx", "ollama"}

    # --- public API ---------------------------------------------------------

    def explain(self, finding: Finding, language: str = "English") -> str:
        """Plain-language explanation of a finding; falls back to the template."""
        if not self.enabled:
            return finding.summary
        system = SYSTEM_EXPLAIN + f" Answer in {language}."
        try:
            text = self.chat(system, finding.summary).strip()
        except Exception:  # network or quota problems must never break a report
            return finding.summary
        return text if numbers_preserved(finding.summary, text) else finding.summary

    def chat(self, system: str, user: str) -> str:
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        if self.provider == "watsonx":
            return self._watsonx(messages)
        if self.provider == "ollama":
            return self._ollama(messages)
        raise RuntimeError("No LLM provider configured (set RECOUP_LLM=watsonx or ollama)")

    # --- providers ------------------------------------------------------------

    def _watsonx(self, messages: list[dict]) -> str:
        base = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
        resp = httpx.post(
            f"{base}/ml/v1/text/chat",
            params={"version": "2024-10-08"},
            headers={"Authorization": f"Bearer {self._iam_token()}"},
            json={
                "model_id": os.getenv("WATSONX_MODEL", "ibm/granite-3-3-8b-instruct"),
                "project_id": os.environ["WATSONX_PROJECT_ID"],
                "messages": messages,
                "parameters": {"temperature": 0, "max_tokens": 600},
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def _iam_token(self) -> str:
        if self._token and self._token[1] > time.time() + 60:
            return self._token[0]
        resp = httpx.post(
            "https://iam.cloud.ibm.com/identity/token",
            data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": os.environ["WATSONX_APIKEY"]},
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()
        self._token = (body["access_token"], float(body["expiration"]))
        return self._token[0]

    def _ollama(self, messages: list[dict]) -> str:
        resp = httpx.post(
            f"{os.getenv('OLLAMA_URL', 'http://localhost:11434')}/api/chat",
            json={
                "model": os.getenv("OLLAMA_MODEL", "granite3.3:8b"),
                "messages": messages,
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]
