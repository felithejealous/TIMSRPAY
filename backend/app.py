from fastapi import FastAPI
from routers.auth import router as auth_router
from routers.orders import router as orders_router
from routers.wallet import router as wallet_router  


app = FastAPI(title="TIMS-RPAY API")

app.include_router(auth_router)
app.include_router(orders_router)
app.include_router(wallet_router)

@app.get("/")
def root():
    return {"message": "Backend is running"}
