import time
import json
import logging
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("structured_logger")

class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        
        # Read body safely
        body = ""
        try:
            body_bytes = await request.body()
            if body_bytes:
                body_str = body_bytes.decode('utf-8')
                if len(body_str) > 1000:
                    body = body_str[:1000] + "... [truncated]"
                else:
                    body = body_str
            # We must reset the body stream so downstream can read it
            async def receive():
                return {"type": "http.request", "body": body_bytes}
            request._receive = receive
        except Exception:
            body = "[Error reading body]"
            
        response = None
        error = None
        try:
            response = await call_next(request)
        except Exception as e:
            error = str(e)
            raise
        finally:
            process_time = (time.time() - start_time) * 1000
            status_code = response.status_code if response else 500
            
            log_data = {
                "method": request.method,
                "url": str(request.url),
                "status_code": status_code,
                "execution_time_ms": round(process_time, 2),
                "body": body,
            }
            if error:
                log_data["error"] = error
                logger.error(json.dumps(log_data))
            elif status_code >= 400:
                logger.warning(json.dumps(log_data))
            else:
                logger.info(json.dumps(log_data))
                
        return response
