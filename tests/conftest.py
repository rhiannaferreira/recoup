import json
from pathlib import Path

import pytest

from recoup.models import Case

SAMPLES = Path(__file__).resolve().parent.parent / "samples"


def load_case(name: str) -> Case:
    return Case.model_validate(json.loads((SAMPLES / f"{name}.json").read_text()))


@pytest.fixture
def maria() -> Case:
    return load_case("maria")


@pytest.fixture
def rosa() -> Case:
    return load_case("rosa")
