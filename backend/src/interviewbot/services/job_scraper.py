"""Job scraping service using RapidAPI Job Search (job-search15)."""

from __future__ import annotations

import httpx
import structlog

from interviewbot.config import get_settings
from interviewbot.models.schemas import ScrapedJobItem

logger = structlog.get_logger()

JOB_SEARCH_API_URL = "https://job-search15.p.rapidapi.com/"
JOB_SEARCH_API_HOST = "job-search15.p.rapidapi.com"


class JobScraperError(Exception):
    pass


class JobScraper:
    """Client for the RapidAPI Job Search API (jaypat87/job-search15)."""

    def __init__(self) -> None:
        settings = get_settings()
        self._api_key = settings.effective_rapidapi_key
        if not self._api_key:
            raise JobScraperError(
                "RAPIDAPI_KEY (or JUDGE0_RAPIDAPI_KEY) must be set to use job scraping"
            )

    async def search_jobs(
        self,
        search_terms: str,
        location: str = "",
        page: int = 1,
    ) -> list[ScrapedJobItem]:
        headers = {
            "X-RapidAPI-Key": self._api_key,
            "X-RapidAPI-Host": JOB_SEARCH_API_HOST,
            "Content-Type": "application/json",
        }
        payload: dict = {
            "api_type": "fetch_jobs",
            "search_terms": search_terms,
            "page": str(page),
        }
        if location:
            payload["location"] = location

        logger.info(
            "job_scraper.search",
            search_terms=search_terms,
            location=location,
            page=page,
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                JOB_SEARCH_API_URL,
                headers=headers,
                json=payload,
            )

        if response.status_code == 429:
            raise JobScraperError("RapidAPI rate limit exceeded — try again later")
        if response.status_code == 403:
            raise JobScraperError("RapidAPI key is invalid or not subscribed to Job Search API")
        if response.status_code != 200:
            logger.error(
                "job_scraper.api_error",
                status=response.status_code,
                body=response.text[:500],
            )
            raise JobScraperError(f"Job Search API returned status {response.status_code}")

        data = response.json()
        raw_jobs = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

        jobs: list[ScrapedJobItem] = []
        for item in raw_jobs:
            if not isinstance(item, dict):
                continue
            try:
                jobs.append(
                    ScrapedJobItem(
                        job_id=str(item.get("job_id", "")),
                        job_title=item.get("job_title", item.get("title", "Untitled")),
                        company_name=item.get("company_name", item.get("company", "Unknown")),
                        location=item.get("location", ""),
                        posted_date=str(item.get("posted_date", item.get("date", ""))),
                        job_url=item.get("job_url", item.get("url", "")),
                        snippet=item.get("snippet", ""),
                        job_description=item.get(
                            "job_description", item.get("description", item.get("snippet", ""))
                        ),
                    )
                )
            except Exception:
                logger.warning("job_scraper.parse_error", item=item)
                continue

        logger.info("job_scraper.results", count=len(jobs))
        return jobs
