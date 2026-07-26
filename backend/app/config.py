from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    admin_username: str = "admin"
    admin_password_hash: str = ""

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    database_url: str = "sqlite:///./persepolis.db"

    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    # Used to build links in emails (e.g. the password-reset link).
    frontend_url: str = "http://127.0.0.1:5500"

    # SMTP — used to send password-reset emails and new quote/review
    # notifications. Left blank, email sending is silently skipped (nothing
    # crashes) — fill these in with a real provider (Gmail app password,
    # SendGrid, Mailgun, etc.) to make emails actually go out.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_tls: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
