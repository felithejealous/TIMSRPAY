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


load_dotenv()


app = FastAPI(title="TIMS-RPAY API")


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
@app.get("/")
def root():
    return {"message": "Backend is running"}
