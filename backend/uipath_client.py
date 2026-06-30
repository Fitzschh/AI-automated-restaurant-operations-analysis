"""
UiPath Orchestrator Client

HTTP client for triggering UiPath Maestro processes
and managing robot jobs via the UiPath Cloud REST API.

Configuration is loaded from environment variables:
    UIPATH_CLOUD_URL       — e.g. https://cloud.uipath.com
    UIPATH_ACCOUNT_NAME    — Cloud account name
    UIPATH_TENANT_NAME     — Tenant name
    UIPATH_CLIENT_ID       — OAuth client ID
    UIPATH_CLIENT_SECRET   — OAuth client secret
    UIPATH_PROCESS_RELEASE_KEY — Release key of the supplier workflow process
    UIPATH_FOLDER_ID       — Orchestrator folder ID
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any

import httpx

logger = logging.getLogger("uipath_client")


class UiPathClient:
    """
    Client for the UiPath Orchestrator REST API.

    Handles OAuth token acquisition and job triggering.
    Falls back to a no-op mode if configuration is missing.
    """

    def __init__(self) -> None:
        self.cloud_url = os.environ.get("UIPATH_CLOUD_URL", "").strip()
        self.account_name = os.environ.get("UIPATH_ACCOUNT_NAME", "").strip()
        self.tenant_name = os.environ.get("UIPATH_TENANT_NAME", "").strip()
        self.client_id = os.environ.get("UIPATH_CLIENT_ID", "").strip()
        self.client_secret = os.environ.get("UIPATH_CLIENT_SECRET", "").strip()
        self.release_key = os.environ.get("UIPATH_PROCESS_RELEASE_KEY", "").strip()
        self.folder_id = os.environ.get("UIPATH_FOLDER_ID", "").strip()

        self._access_token: str | None = None
        self._token_expires_at: float = 0

    @property
    def public_url(self) -> str:
        """The public callback URL for UiPath, from ngrok or env."""
        return os.environ.get("EVENT_GATEWAY_PUBLIC_URL", "http://localhost:5001").strip()

    @property
    def is_configured(self) -> bool:
        """Check if UiPath credentials are configured and not placeholders."""
        def is_valid(val: str) -> bool:
            return bool(val and not val.startswith("your_"))
            
        return (
            is_valid(self.cloud_url)
            and is_valid(self.account_name)
            and is_valid(self.tenant_name)
            and is_valid(self.client_id)
            and is_valid(self.client_secret)
            and is_valid(self.release_key)
            and is_valid(self.folder_id)
        )

    @property
    def base_url(self) -> str:
        """Orchestrator base URL."""
        return f"{self.cloud_url}/{self.account_name}/{self.tenant_name}/orchestrator_"

    async def _get_access_token(self) -> str:
        """Acquire or refresh OAuth access token."""
        import time

        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        token_url = f"{self.cloud_url}/identity_/connect/token"
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "OR.Jobs OR.Execution OR.Folders.Read",
        }

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(token_url, data=payload)
            response.raise_for_status()
            data = response.json()

        self._access_token = data["access_token"]
        # Refresh 60s before actual expiry
        self._token_expires_at = time.time() + data.get("expires_in", 3600) - 60
        logger.info("UiPath OAuth token acquired, expires in %ds", data.get("expires_in", 3600))
        return self._access_token

    async def start_supplier_workflow(
        self,
        workflow_id: str,
        branch_id: str,
        item_key: str,
        item_name: str,
        action_plan: str,
        restock_amount: int,
        supplier_email: str = "",
        supplier_name: str = "",
    ) -> dict[str, Any]:
        """
        Trigger the supplier communication UiPath process.

        Returns:
            { "job_id": str, "status": str, "simulated": bool }
        """
        if not self.is_configured:
            # Simulation mode — log and return a fake job ID
            logger.warning(
                "[UiPath] Not configured — simulating job start for workflow %s",
                workflow_id,
            )
            return {
                "job_id": f"sim_{workflow_id}",
                "status": "Pending",
                "simulated": True,
            }

        try:
            token = await self._get_access_token()

            input_args = json.dumps({
                "workflowId": workflow_id,
                "branchId": branch_id,
                "itemKey": item_key,
                "itemName": item_name,
                "actionPlan": action_plan,
                "restockAmount": restock_amount,
                "supplierEmail": supplier_email,
                "supplierName": supplier_name,
                "callbackUrl": f"{self.public_url}/uipath/callback",
            })

            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-UIPATH-OrganizationUnitId": self.folder_id,
            }

            body = {
                "startInfo": {
                    "ReleaseKey": self.release_key,
                    "Strategy": "Specific",
                    "RobotIds": [],
                    "NoOfRobots": 0,
                    "InputArguments": input_args,
                },
            }

            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.base_url}/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs",
                    headers=headers,
                    json=body,
                )
                response.raise_for_status()
                data = response.json()

            job = data.get("value", [{}])[0] if data.get("value") else {}
            job_id = str(job.get("Id", ""))
            job_status = job.get("State", "Pending")

            logger.info(
                "[UiPath] Job started: id=%s status=%s workflow=%s",
                job_id, job_status, workflow_id,
            )
            return {
                "job_id": job_id,
                "status": job_status,
                "simulated": False,
            }

        except Exception as exc:
            logger.error("[UiPath] Failed to start job for workflow %s: %s", workflow_id, exc)
            return {
                "job_id": "",
                "status": "Failed",
                "error": str(exc),
                "simulated": False,
            }

    async def get_pending_tasks(self) -> list[dict[str, Any]]:
        """
        Fetch unassigned or pending Action Center tasks from UiPath.
        Uses $expand=Data to allow inspection of workflow_id or branch_id.
        """
        if not self.is_configured:
            logger.warning("[UiPath] Not configured — cannot fetch pending tasks.")
            return []

        try:
            token = await self._get_access_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "X-UIPATH-OrganizationUnitId": self.folder_id,
            }
            
            # Filter for Unassigned and Pending tasks, expand Data to inspect variables
            url = f"{self.base_url}/odata/Tasks?$filter=Status eq 'Unassigned' or Status eq 'Pending'&$expand=Data"
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                
            tasks = data.get("value", [])
            logger.info("[UiPath] Discovered %d pending/unassigned tasks.", len(tasks))
            return tasks
            
        except Exception as exc:
            logger.error("[UiPath] Failed to fetch pending tasks: %s", exc)
            return []

    async def complete_hitl_task(
        self, 
        task_id: int, 
        decision: str, 
        notes: str | None = None
    ) -> bool:
        """
        Complete an Actions.HITL task via Orchestrator API.
        The data payload will be injected into the Maestro process.
        """
        if not self.is_configured:
            logger.warning("[UiPath] Not configured — simulating completion of task %s.", task_id)
            return True

        try:
            token = await self._get_access_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-UIPATH-OrganizationUnitId": self.folder_id,
            }
            
            url = f"{self.base_url}/odata/Tasks/UiPath.Server.Configuration.OData.CompleteTask"
            
            payload = {
                "taskId": task_id,
                "action": "Complete",
                "data": {
                    "Decision": decision,
                    "Notes": notes or ""
                }
            }
            
            logger.info("[UiPath] Completing task %s with decision %s", task_id, decision)
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                
            logger.info("[UiPath] Task %s completed successfully.", task_id)
            return True
            
        except Exception as exc:
            logger.error("[UiPath] Failed to complete task %s: %s", task_id, exc)
            return False


# Singleton instance
uipath_client = UiPathClient()
