function getParams() {
  const params = new URLSearchParams(window.location.search)
  return {
    name: params.get("name") || "Unknown drink",
    basePrice: Number.parseFloat(params.get("price")) || 0,
    desc: params.get("desc") || "",
  }
}

function calculateItemPrice() {
  const { basePrice } = getParams()
  let total = basePrice
  const breakdown = {
    base: basePrice,
    sizeUpcharge: 0,
    addonsTotal: 0,
  }

  const size = document.querySelector("input[name='size']:checked")?.value
  if (size === "medium") {
    breakdown.sizeUpcharge = 10
    total += 10
  }
  if (size === "large") {
    breakdown.sizeUpcharge = 20
    total += 20
  }

  const addons = []
  document.querySelectorAll("input[name='topping']:checked").forEach((cb) => {
    let addonPrice = 0
    if (cb.value === "pearls") addonPrice = 10
    if (cb.value === "crystals") addonPrice = 20
    if (cb.value === "icecream") addonPrice = 20
    if (cb.value === "graham") addonPrice = 20

    breakdown.addonsTotal += addonPrice
    total += addonPrice
    addons.push({ name: cb.value, price: addonPrice })
  })

  return { total, breakdown, addons }
}

function updateDisplayedPrice() {
  const qtyEl = document.getElementById("quantity")
  const qty = Number.parseInt(qtyEl?.value) || 1

  const { total } = calculateItemPrice()
  const finalTotal = total * qty

  document.querySelector(".bottom-price h2").textContent = finalTotal.toFixed(2)
}

function addToCart() {
  const { name, basePrice, desc } = getParams()
  const size = document.querySelector("input[name='size']:checked")?.value || "small"
  const qty = Number.parseInt(document.getElementById("quantity").value) || 1

  const { total, breakdown, addons } = calculateItemPrice()

  // Create structured item object ready for backend
  const item = {
    productName: name,
    productDescription: desc,
    basePrice: basePrice,
    size: size,
    sizeUpcharge: breakdown.sizeUpcharge,
    addons: addons, // Array of {name, price} objects
    quantity: qty,
    itemSubtotal: total,
    itemTotal: total * qty,
    addedAt: new Date().toISOString(),
  }

  const cart = JSON.parse(localStorage.getItem("cart")) || []
  cart.push(item)
  localStorage.setItem("cart", JSON.stringify(cart))

  console.log("[v0] Item added to cart:", item)
}

document.addEventListener("DOMContentLoaded", () => {
  const { name, basePrice, desc } = getParams()

  // Update product display
  document.querySelector(".product-title").textContent = name
  document.querySelector(".product-description").textContent = desc
  document.querySelector(".base-price").textContent = basePrice.toFixed(2)

  const qtyInput = document.getElementById("quantity")

  // Add event listeners for real-time price updates
  document
    .querySelectorAll("input[name='size'], input[name='topping']")
    .forEach((el) => el.addEventListener("change", updateDisplayedPrice))
  qtyInput.addEventListener("input", updateDisplayedPrice)

  // Initial price calculation
  updateDisplayedPrice()

  document.getElementById("proceedBtn").addEventListener("click", () => {
    addToCart()
    alert("Item added to cart!")
    // Go back to menu so customer can add more items
    window.location.href = "../html/menu.html"
  })
})
