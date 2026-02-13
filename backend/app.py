from fastapi import FastAPI
from routers.auth import router as auth_router
from routers.orders import router as orders_router
from routers.wallet import router as wallet_router
from routers.addons import router as addons_router
from routers.inventory import router as inventory_router
from routers import reports
from routers import rewards
from routers.recipes import router as recipes_router
from routers.products import router as products_router
import models
from routers.attendance import router as attendance_router
from routers.staff import router as staff_router
from routers.users import router as users_router
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import os
from routers.announcement import router as announcements_router
from fastapi.staticfiles import StaticFiles

load_dotenv()

app = FastAPI(title="TIMS-RPAY API")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
# -----------------------
# CORS
# -----------------------
cors_origins_env = (os.getenv("CORS_ORIGINS") or "").strip()
default_origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]
allow_origins = (
    [o.strip() for o in cors_origins_env.split(",") if o.strip()]
    if cors_origins_env
    else default_origins
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------
# ROUTERS
# -----------------------
app.include_router(auth_router)
app.include_router(orders_router)
app.include_router(wallet_router)
app.include_router(addons_router)
app.include_router(reports.router)
app.include_router(rewards.router)
app.include_router(recipes_router)
app.include_router(inventory_router)
app.include_router(products_router)
app.include_router(attendance_router)
app.include_router(staff_router)
app.include_router(users_router)
app.include_router(announcements_router)
@app.get("/")
def root():
    return {"message": "Backend is running"}
