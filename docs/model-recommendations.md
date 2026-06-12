# Model Recommendations

LoreKeeper treats local models as interchangeable provider components. Recommendations should change as the local model ecosystem improves.

## Evaluation Criteria

- Storytelling quality
- Instruction following
- Continuity with supplied context
- Reliability of `json lorekeeper_updates`
- Speed to first token
- Full turn duration
- Hardware accessibility

## Initial Candidates

| Model | Role | Notes |
| --- | --- | --- |
| `llama3.1:8b` | Fast default | Good first local model to test interactive tabletop flow on consumer hardware. |
| `mistral-nemo` | Balanced storyteller | Candidate for stronger prose and roleplay if hardware can keep it responsive. |
| `qwen3:14b` | Heavier quality candidate | Worth evaluating for instruction following and context use, but likely slower. |

## Recommendation Strategy

- Keep the selected model in campaign settings.
- Keep recommended models as data, not hard-coded provider logic.
- Benchmark locally with the same prompt shape used in play.
- Prefer models that can complete a typical turn in 10-20 seconds on the target machine.
- Prefer reliable JSON contract behavior over slightly better prose.

## Future Additions

Future model metadata should include:

- model id
- display label
- estimated RAM/VRAM needs
- speed tier
- quality tier
- contract reliability notes
- recommended context/output limits

