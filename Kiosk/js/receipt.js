function loadReceipt() {
  const orderData = JSON.parse(localStorage.getItem("currentOrder"))

  if (!orderData) {
    console.error("[v0] No order data found!")
    return
  }

  console.log("[v0] Loading receipt for order:", orderData)

  // Set order number
  document.getElementById("orderNumber").textContent = orderData.orderId || "0000"

  const orderTypeElement = document.getElementById("orderType")
  if (orderTypeElement) {
    orderTypeElement.textContent = orderData.orderType || "Dine-in"
  }

  if (orderData.queueNumber) {
    const queueRow = document.getElementById("queueNumberRow")
    if (queueRow) {
      queueRow.style.display = "flex"
      document.getElementById("queueNumber").textContent = orderData.queueNumber
    }
  }

  if (orderData.tableNumber) {
    const tableRow = document.getElementById("tableNumberRow")
    if (tableRow) {
      tableRow.style.display = "flex"
      document.getElementById("tableNumber").textContent = orderData.tableNumber
    }
  }

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
    hour12: true,
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

  // Set points (14 points per cup purchased)
  document.getElementById("earnedPoints").textContent = orderData.pointsEarned || 14

  generatePreviewSummary(orderData)

  initializeConfirmButton()
}

function generatePreviewSummary(orderData) {
  const previewSummary = document.getElementById("previewSummary")
  previewSummary.innerHTML = ""

  let summaryHTML = `
    <div class="preview-item-list">
      <h4>Items:</h4>
  `

  if (orderData.items && orderData.items.length > 0) {
    orderData.items.forEach((item) => {
      let itemName = `${item.name} (${item.size})`
      if (item.quantity > 1) {
        itemName = `${item.quantity}x ${itemName}`
      }
      summaryHTML += `<p>• ${itemName} - ₱${item.itemTotal.toFixed(2)}</p>`

      if (item.addons && item.addons.length > 0) {
        item.addons.forEach((addon) => {
          const addonName = typeof addon === "object" ? addon.name : addon
          summaryHTML += `<p style="padding-left: 20px;">+ ${addonName}</p>`
        })
      }
    })
  }

  summaryHTML += `
    </div>
    <div class="preview-totals">
      <p><strong>Order Type:</strong> ${orderData.orderType || "Dine-in"}</p>
      <p><strong>Subtotal:</strong> ₱${orderData.subtotal.toFixed(2)}</p>
      <p><strong>Tax (5%):</strong> ₱${orderData.tax.toFixed(2)}</p>
      <p style="font-size: 1.2em; color: #FBBC04;"><strong>Total: ₱${orderData.total.toFixed(2)}</strong></p>
      <p><strong>Points Earned:</strong> ${orderData.pointsEarned || 14}</p>
    </div>
  `

  previewSummary.innerHTML = summaryHTML
}

function confirmOrder() {
  console.log("[v0] Confirm button clicked!")

  const printOverlay = document.getElementById("printOverlay")

  if (printOverlay) {
    printOverlay.classList.add("show")
  }

  console.log("[v0] Order confirmed, clearing data and preparing for next customer")

  setTimeout(() => {
    // Clear ALL localStorage data
    localStorage.clear()

    console.log("[v0] All data cleared, redirecting to landing page")
    // Redirect to landing page to restart kiosk
    window.location.href = "../html/index.html"
  }, 2000)
}

function initializeConfirmButton() {
  const confirmBtn = document.querySelector(".receipt-btn")
  const printOverlay = document.getElementById("printOverlay")

  if (!confirmBtn) {
    console.error("[v0] Confirm button not found!")
    return
  }

  console.log("[v0] Confirm button found, adding event listener")

  confirmBtn.addEventListener("click", confirmOrder)

  console.log("[v0] Confirm button event listener added successfully")
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("[v0] Receipt page loaded, initializing...")
  loadReceipt()
})
