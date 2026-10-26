from flask import Flask, jsonify

from .config import Config
from .extensions import cors, db, jwt, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.json.ensure_ascii = False

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    from . import models  # noqa: F401  (đăng ký model cho Alembic)
    from .api import auth, incidents, lot, prices, reports, sessions, users
    from .cli import register_cli
    from .utils import register_error_handlers

    for module in (auth, users, lot, prices, sessions, incidents, reports):
        app.register_blueprint(module.bp)

    register_error_handlers(app)
    _register_jwt_handlers()
    register_cli(app)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app


def _register_jwt_handlers():
    def error(code, message):
        return jsonify({"error": {"code": code, "message": message}}), 401

    jwt.expired_token_loader(lambda _h, _p: error("TOKEN_EXPIRED", "Phiên đăng nhập đã hết hạn"))
    jwt.invalid_token_loader(lambda _reason: error("INVALID_TOKEN", "Phiên đăng nhập không hợp lệ"))
    jwt.unauthorized_loader(lambda _reason: error("UNAUTHORIZED", "Vui lòng đăng nhập"))
