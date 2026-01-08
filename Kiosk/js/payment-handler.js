function generateOrderId() {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  return `${timestamp}${random}`.slice(-8)
}

function calculateOrderPoints(total) {
  // 14 points per purchase as per requirement
  return 14
}

function createOrderFromCart() {
  const cart = JSON.parse(localStorage.getItem("cart")) || []

  if (cart.length === 0) {
    alert("Your cart is empty!")
    return null
  }

  let subtotal = 0
  const orderItems = []

  cart.forEach((item) => {
    // Calculate item total
    let itemPrice = item.basePrice || 0

    if (item.sizeUpcharge) {
      itemPrice += item.sizeUpcharge
    } else {
      if (item.size === "medium") itemPrice += 10
      if (item.size === "large") itemPrice += 20
    }

    if (item.addons && Array.isArray(item.addons)) {
      if (item.addons.length > 0 && typeof item.addons[0] === "object") {
        item.addons.forEach((addon) => {
          itemPrice += addon.price || 0
        })
      } else {
        item.addons.forEach((addon) => {
          if (addon === "pearls") itemPrice += 10
          if (addon === "crystals") itemPrice += 20
          if (addon === "icecream") itemPrice += 20
          if (addon === "graham") itemPrice += 20
        })
      }
    }

    const qty = item.quantity || item.qty || 1
    const itemTotal = itemPrice * qty
    subtotal += itemTotal

    orderItems.push({
      name: item.productName || item.name,
      size: item.size,
      addons: item.addons,
      quantity: qty,
      unitPrice: itemPrice,
      itemTotal: itemTotal,
    })
  })

  const tax = 1.0
  const total = subtotal + tax
  const points = calculateOrderPoints(total)

  // Create complete order object ready for backend
  const order = {
    orderId: generateOrderId(),
    orderDate: new Date().toISOString(),
    orderType: "kiosk",
    items: orderItems,
    subtotal: subtotal,
    tax: tax,
    total: total,
    pointsEarned: points,
    paymentMethod: null, // Will be set on payment page
    status: "pending",
  }

  console.log("[v0] Order created:", order)
  return order
}

// Export functions for use in other pages
if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateOrderId, calculateOrderPoints, createOrderFromCart }
}

window.createOrderFromCart = createOrderFromCart
