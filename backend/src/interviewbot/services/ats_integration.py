"""ATS integration service for pushing scorecards to external platforms."""

from __future__ import annotations

import httpx
import structlog

logger = structlog.get_logger()

# ATS platform adapters


class ATSAdapter:
    """Base class for ATS platform adapters."""

    async def push_scorecard(self, config: dict, scorecard: dict) -> dict:
        raise NotImplementedError


class GreenhouseAdapter(ATSAdapter):
    """Greenhouse ATS integration via Harvest API.

    Required config keys: api_key, candidate_id (optional: application_id)
    Docs: https://developers.greenhouse.io/harvest.html#post-add-scorecard
    """

    BASE_URL = "https://harvest.greenhouse.io/v1"

    async def push_scorecard(self, config: dict, scorecard: dict) -> dict:
        api_key = config.get("api_key", "")
        application_id = config.get("application_id")

        if not api_key or not application_id:
            return {"success": False, "error": "Missing api_key or application_id"}

        # Map our dimensional scores to Greenhouse attributes
        attributes = []
        for dim_name, dim_data in scorecard.get("skill_scores", {}).items():
            score = dim_data.get("score")
            if score is not None:
                # Greenhouse uses 1-4 rating scale
                gh_rating = _to_greenhouse_rating(score)
                attributes.append(
                    {
                        "name": _format_dimension_name(dim_name),
                        "type": "rating",
                        "rating": gh_rating,
                        "notes": dim_data.get("evidence", ""),
                    }
                )

        payload = {
            "overall_recommendation": _to_greenhouse_recommendation(
                scorecard.get("recommendation", "")
            ),
            "attributes": attributes,
            "notes": scorecard.get("summary", scorecard.get("ai_summary", "")),
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/applications/{application_id}/scorecards",
                    json=payload,
                    auth=(api_key, ""),
                )
                response.raise_for_status()
                logger.info("greenhouse_scorecard_pushed", application_id=application_id)
                return {"success": True, "response": response.json()}
        except httpx.HTTPError as e:
            logger.error("greenhouse_push_failed", error=str(e))
            return {"success": False, "error": str(e)}


class LeverAdapter(ATSAdapter):
    """Lever ATS integration via API.

    Required config keys: api_key, opportunity_id
    Docs: https://hire.lever.co/developer/documentation
    """

    BASE_URL = "https://api.lever.co/v1"

    async def push_scorecard(self, config: dict, scorecard: dict) -> dict:
        api_key = config.get("api_key", "")
        opportunity_id = config.get("opportunity_id")

        if not api_key or not opportunity_id:
            return {"success": False, "error": "Missing api_key or opportunity_id"}

        # Build Lever feedback structure
        fields = []
        for dim_name, dim_data in scorecard.get("skill_scores", {}).items():
            score = dim_data.get("score")
            if score is not None:
                fields.append(
                    {
                        "text": _format_dimension_name(dim_name),
                        "code_text": dim_name,
                        "value": str(round(score, 1)),
                        "description": dim_data.get("evidence", ""),
                    }
                )

        strengths = scorecard.get("strengths", [])
        concerns = scorecard.get("concerns", [])
        summary = scorecard.get("summary", scorecard.get("ai_summary", ""))
        notes = f"## AI Interview Summary\n{summary}"
        if strengths:
            notes += "\n\n## Strengths\n" + "\n".join(f"- {s}" for s in strengths)
        if concerns:
            notes += "\n\n## Concerns\n" + "\n".join(f"- {c}" for c in concerns)

        payload = {
            "feedback": notes,
            "score": _to_lever_rating(scorecard.get("overall_score", 5)),
            "completedAt": None,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/opportunities/{opportunity_id}/feedback",
                    json=payload,
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                response.raise_for_status()
                logger.info("lever_scorecard_pushed", opportunity_id=opportunity_id)
                return {"success": True, "response": response.json()}
        except httpx.HTTPError as e:
            logger.error("lever_push_failed", error=str(e))
            return {"success": False, "error": str(e)}


class WorkableAdapter(ATSAdapter):
    """Workable ATS integration via API.

    Required config keys: subdomain, api_key, candidate_id, job_shortcode
    Docs: https://workable.readme.io/reference
    """

    async def push_scorecard(self, config: dict, scorecard: dict) -> dict:
        api_key = config.get("api_key", "")
        subdomain = config.get("subdomain", "")
        candidate_id = config.get("candidate_id")
        job_shortcode = config.get("job_shortcode")

        if not all([api_key, subdomain, candidate_id, job_shortcode]):
            return {"success": False, "error": "Missing required Workable config"}

        summary = scorecard.get("summary", scorecard.get("ai_summary", ""))
        recommendation = scorecard.get("recommendation", "")
        overall_score = scorecard.get("overall_score", 0)

        comment = (
            f"**AI Interview Scorecard**\n\n"
            f"Overall: {overall_score}/10 | Recommendation: {recommendation}\n\n{summary}"
        )

        payload = {
            "body": comment,
            "policy": ["hiring_managers", "admins"],
        }

        try:
            base_url = f"https://{subdomain}.workable.com/spi/v3"
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{base_url}/jobs/{job_shortcode}/candidates/{candidate_id}/comments",
                    json=payload,
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                response.raise_for_status()
                logger.info("workable_scorecard_pushed", candidate_id=candidate_id)
                return {"success": True, "response": response.json()}
        except httpx.HTTPError as e:
            logger.error("workable_push_failed", error=str(e))
            return {"success": False, "error": str(e)}


# Mapping helpers


def _to_greenhouse_rating(score: float) -> str:
    """Map 0-10 score to Greenhouse 4-point scale."""
    if score >= 8:
        return "strong_yes"
    if score >= 6:
        return "yes"
    if score >= 4:
        return "no"
    return "strong_no"


def _to_greenhouse_recommendation(rec: str) -> str:
    rec_lower = rec.lower().replace(" ", "_")
    if "strong_hire" in rec_lower:
        return "strong_yes"
    if "hire" in rec_lower:
        return "yes"
    if "lean_no" in rec_lower:
        return "no"
    return "strong_no"


def _to_lever_rating(score: float) -> int:
    """Map 0-10 score to Lever 1-4 scale."""
    if score >= 8:
        return 4
    if score >= 6:
        return 3
    if score >= 4:
        return 2
    return 1


def _format_dimension_name(name: str) -> str:
    return name.replace("_", " ").title()


# Registry

ATS_ADAPTERS: dict[str, type[ATSAdapter]] = {
    "greenhouse": GreenhouseAdapter,
    "lever": LeverAdapter,
    "workable": WorkableAdapter,
}


async def push_to_ats(platform: str, config: dict, scorecard: dict) -> dict:
    """Push a scorecard to an ATS platform."""
    adapter_cls = ATS_ADAPTERS.get(platform.lower())
    if not adapter_cls:
        return {
            "success": False,
            "error": f"Unsupported ATS platform: {platform}. Supported: {', '.join(ATS_ADAPTERS)}",
        }

    adapter = adapter_cls()
    return await adapter.push_scorecard(config, scorecard)
