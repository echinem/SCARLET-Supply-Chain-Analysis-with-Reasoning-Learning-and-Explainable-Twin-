from typing import Optional

def format_response(status: str, data: Optional[dict] = None, meta: dict = {}, error: Optional[str] = None):
    return {
         "status": status,
         "data": data if data is not None else {},
         "meta": meta,
         "error": error
    }
