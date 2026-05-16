from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    latex_service_url: str
    anthropic_api_key: str
    jwt_secret: str
    storage_backend: str = "local"
    storage_local_root: str = "/storage"
    s3_bucket: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"

    # Registration gate
    registration_token: str = ""

    # Admin — email of the designated admin user (regular account + elevated API access)
    admin_email: str = ""

    # CORS — comma-separated list of allowed origins
    # Default: localhost only. Set to production domain at deploy time.
    allowed_origins_str: str = "http://localhost:3000,http://localhost:8000"

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins_str.split(",") if o.strip()]

    # JWT
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Input size limits
    jd_text_max_chars: int = 15_000
    tex_source_max_bytes: int = 100_000
    background_text_max_chars: int = 10_000
    custom_instruction_max_chars: int = 500
    personal_hook_max_chars: int = 300
    pdf_upload_max_bytes: int = 5_242_880  # 5 MB

    # Rate limits (requests per hour per user)
    rate_limit_tailor: int = 20
    rate_limit_ats_score: int = 30
    rate_limit_cover_letter: int = 10
    rate_limit_skill_gap: int = 10
    rate_limit_ai_fill: int = 10

    # S-09: per-user daily AI budget in USD (0 = unlimited)
    daily_ai_budget_usd: float = 2.00

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
