from fastapi import FastAPI
from backend.routers.auth import router as auth_router
from backend.routers.orders import router as orders_router
from backend.routers.wallet import router as wallet_router
from backend.routers.addons import router as addons_router
from backend.routers.inventory import router as inventory_router
from backend.routers import reports
from backend.routers import rewards
from backend.routers.recipes import router as recipes_router
from backend.routers.products import router as products_router
<<<<<<< HEAD
=======
from backend.routers.promo import router as promo_router
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
from backend import models
from backend.routers.attendance import router as attendance_router
from backend.routers.staff import router as staff_router
from backend.routers.users import router as users_router
<<<<<<< HEAD
=======
from backend.routers.inquiries import router as inquiries_router
from backend.routers.feedback import router as feedback_router
from backend.routers.faq import router as faq_router
from backend.routers.activity_logs import router as activity_logs_router
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import os
from backend.routers.announcement import router as announcements_router
from fastapi.staticfiles import StaticFiles
<<<<<<< HEAD

=======
from backend.routers.admin import router as admin_router
from backend.routers.notification import router as notification_router
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
load_dotenv()

app = FastAPI(title="TIMS-RPAY API")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
<<<<<<< HEAD
# -----------------------
# CORS
# -----------------------
=======

>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
cors_origins_env = (os.getenv("CORS_ORIGINS") or "").strip()
default_origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
<<<<<<< HEAD
=======
    "https://felithejealous.github.io",
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
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

<<<<<<< HEAD
# -----------------------
# ROUTERS
# -----------------------
=======
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
app.include_router(auth_router)
app.include_router(orders_router)
app.include_router(wallet_router)
app.include_router(addons_router)
app.include_router(reports.router)
app.include_router(rewards.router)
app.include_router(recipes_router)
app.include_router(inventory_router)
app.include_router(products_router)
<<<<<<< HEAD
=======
app.include_router(promo_router)
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
app.include_router(attendance_router)
app.include_router(staff_router)
app.include_router(users_router)
app.include_router(announcements_router)
<<<<<<< HEAD
@app.get("/")
def root():
    return {"message": "Backend is running"}
=======
app.include_router(admin_router)
app.include_router(inquiries_router)
app.include_router(feedback_router)
app.include_router(faq_router)
app.include_router(activity_logs_router)
app.include_router(notification_router)
@app.get("/")
def root():
    return {"message": "Backend is running"}
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
