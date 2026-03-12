"""Unit tests for code execution service."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from interviewbot.services.code_executor import execute_code


@pytest.mark.asyncio
async def test_execute_code_missing_api_key():
    with patch("interviewbot.services.code_executor.get_settings") as mock_settings:
        mock_settings.return_value.judge0_rapidapi_key = ""
        result = await execute_code("print('hi')", "python")
        assert result.status == "error"
        assert "not configured" in result.stderr


@pytest.mark.asyncio
async def test_execute_code_unsupported_language():
    with patch("interviewbot.services.code_executor.get_settings") as mock_settings:
        mock_settings.return_value.judge0_rapidapi_key = "test-key"
        mock_settings.return_value.judge0_api_url = "https://judge0.example.com"
        result = await execute_code("code", "brainfuck")
        assert result.status == "error"
        assert "Unsupported" in result.stderr


@pytest.mark.asyncio
async def test_execute_code_success():
    post_resp = AsyncMock()
    post_resp.status_code = 200
    post_resp.json = lambda: {"token": "t1"}
    post_resp.raise_for_status = AsyncMock()

    get_resp = AsyncMock()
    get_resp.status_code = 200
    get_resp.json = lambda: {
        "status": {"id": 3, "description": "Accepted"},
        "stdout": "hello",
        "stderr": "",
        "compile_output": "",
        "time": "0.1",
        "memory": 1000,
        "exit_code": 0,
    }
    get_resp.raise_for_status = AsyncMock()

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=post_resp)
    mock_client.get = AsyncMock(return_value=get_resp)

    mock_aclient = MagicMock()
    mock_aclient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
    mock_aclient.return_value.__aexit__ = AsyncMock(return_value=None)

    with (
        patch("interviewbot.services.code_executor.get_settings") as mock_settings,
        patch("interviewbot.services.code_executor.asyncio.sleep", new_callable=AsyncMock),
        patch(
            "interviewbot.services.code_executor.httpx.AsyncClient",
            new=mock_aclient,
        ),
    ):
        mock_settings.return_value.judge0_rapidapi_key = "test-key"
        mock_settings.return_value.judge0_api_url = "https://judge0.example.com"
        result = await execute_code("print('hello')", "python")
        assert result.status == "Accepted"
        assert result.stdout == "hello"
        assert result.stderr == ""


@pytest.mark.asyncio
async def test_execute_code_http_error():
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("interviewbot.services.code_executor.get_settings") as mock_settings:
        mock_settings.return_value.judge0_rapidapi_key = "test-key"
        mock_settings.return_value.judge0_api_url = "https://judge0.example.com"
        with patch(
            "interviewbot.services.code_executor.httpx.AsyncClient",
        ) as mock_aclient:
            mock_aclient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_aclient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = await execute_code("print('hi')", "python")
            assert result.status == "error"
            assert "error" in result.stderr.lower()
