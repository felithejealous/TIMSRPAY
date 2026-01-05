function loadReceipt() {
  const orderData = JSON.parse(localStorage.getItem("currentOrder"))

  if (!orderData) {
    console.error("[v0] No order data found!")
    return
  }

  console.log("[v0] Loading receipt for order:", orderData)

  // Set order number
  document.getElementById("orderNumber").textContent = orderData.orderId || "0000"

  // Set date and time
  const orderDate = new Date(orderData.orderDate)
  const dateStr = orderDate.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
  const timeStr = orderDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  document.getElementById("orderDate").textContent = dateStr
  document.getElementById("orderTime").textContent = timeStr
  document.getElementById("paymentMethod").textContent = orderData.paymentMethod || "Cash"

  // Load items
  const itemsContainer = document.getElementById("receiptItems")
  itemsContainer.innerHTML = ""

  if (orderData.items && orderData.items.length > 0) {
    orderData.items.forEach((item) => {
      // Format item name with size
      let itemName = `${item.name} (${item.size})`
      if (item.quantity > 1) {
        itemName = `${item.quantity}x ${itemName}`
      }

      const itemEl = document.createElement("div")
      itemEl.classList.add("item")
      itemEl.innerHTML = `
        <span>${itemName}</span>
        <span>₱${item.itemTotal.toFixed(2)}</span>
      `
      itemsContainer.appendChild(itemEl)

      // Add addons as sub-items
      if (item.addons && item.addons.length > 0) {
        item.addons.forEach((addon) => {
          const addonName = typeof addon === "object" ? addon.name : addon
          const addonDiv = document.createElement("div")
          addonDiv.classList.add("item")
          addonDiv.innerHTML = `
            <span style="padding-left: 20px; font-size: 0.9em;">+ ${addonName}</span>
            <span></span>
          `
          itemsContainer.appendChild(addonDiv)
        })
      }
    })
  }

  // Set totals
  document.getElementById("subtotalAmount").textContent = `₱${orderData.subtotal.toFixed(2)}`
  document.getElementById("taxAmount").textContent = `₱${orderData.tax.toFixed(2)}`
  document.getElementById("totalAmount").textContent = `₱${orderData.total.toFixed(2)}`

  // Set points (14 points per purchase)
  document.getElementById("earnedPoints").textContent = orderData.pointsEarned || 14
}

document.addEventListener("DOMContentLoaded", () => {
  loadReceipt()

  const printBtn = document.querySelector(".receipt-btn")
  const overlay = document.getElementById("printOverlay")

  printBtn.addEventListener("click", () => {
    overlay.classList.add("show")

    console.log("[v0] Receipt printed, order complete")

    setTimeout(() => {
      // Clear cart and current order so next customer starts fresh
      localStorage.removeItem("cart")
      localStorage.removeItem("currentOrder")

      window.location.href = "../html/success.html"
    }, 3000)
  })
})
