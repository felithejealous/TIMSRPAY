function calculateCartItemSubtotal(item) {
  let subtotal = item.basePrice || 0

  // Add size upcharge
  if (item.sizeUpcharge) {
    subtotal += item.sizeUpcharge
  } else {
    if (item.size === "medium") subtotal += 10
    if (item.size === "large") subtotal += 20
  }

  // Add addons
  if (item.addons && Array.isArray(item.addons)) {
    if (item.addons.length > 0 && typeof item.addons[0] === "object") {
      item.addons.forEach((addon) => {
        subtotal += addon.price || 0
      })
    } else {
      item.addons.forEach((addon) => {
        if (addon === "pearls") subtotal += 10
        if (addon === "crystals") subtotal += 20
        if (addon === "icecream") subtotal += 20
        if (addon === "graham") subtotal += 20
      })
    }
  }

  const qty = item.quantity || item.qty || 1
  return subtotal * qty
}

function loadCart() {
  const cart = JSON.parse(localStorage.getItem("cart")) || []
  const cartItemsContainer = document.querySelector(".cart-items")
  const cartTotalText = document.querySelector(".cart-total-text")
  const cartBarTotal = document.querySelector(".cart-total")

  // Clear cart display
  cartItemsContainer.innerHTML = ""
  let grandTotal = 0

  // If cart is empty, show zero
  if (cart.length === 0) {
    cartTotalText.textContent = "Total: ₱0.00"
    cartBarTotal.textContent = "₱0.00"
    return
  }

  cart.forEach((item, index) => {
    const subtotal = calculateCartItemSubtotal(item)
    grandTotal += subtotal

    // Format addons for display
    let addonsText = "no add-ons"
    if (item.addons && item.addons.length > 0) {
      if (typeof item.addons[0] === "object") {
        addonsText = item.addons.map((a) => a.name).join(", ")
      } else {
        addonsText = item.addons.join(", ")
      }
    }

    const itemName = item.productName || item.name
    const itemQty = item.quantity || item.qty || 1

    // Build cart item element
    const div = document.createElement("div")
    div.classList.add("cart-item")
    div.innerHTML = `
      <img src="https://via.placeholder.com/60" alt="product">
      <div style="flex-grow:1;">
        <h4 style="font-size:0.9rem;">${itemName}</h4>
        <p style="font-size:0.7rem; color:#999;">
          • ${item.size} • ${addonsText}
        </p>
        <label style="font-size:0.7rem;">Qty:
          <input type="number" min="1" value="${itemQty}" data-index="${index}" class="qty-input" style="width:50px;">
        </label>
      </div>
      <div style="font-weight:bold; color:#FBBC04;">₱${subtotal.toFixed(2)}</div>
      <button class="remove-btn" data-index="${index}" style="margin-left:10px; color:red; cursor:pointer; border:none; background:none; font-size:1.2rem;">✕</button>
    `
    cartItemsContainer.appendChild(div)
  })

  cartTotalText.textContent = `Total: ₱${grandTotal.toFixed(2)}`
  cartBarTotal.textContent = `₱${grandTotal.toFixed(2)}`

  document.querySelectorAll(".qty-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = Number.parseInt(e.target.dataset.index)
      const newQty = Number.parseInt(e.target.value) || 1

      if (cart[idx]) {
        if (cart[idx].quantity) {
          cart[idx].quantity = newQty
        } else {
          cart[idx].qty = newQty
        }
        localStorage.setItem("cart", JSON.stringify(cart))
        loadCart()
      }
    })
  })

  document.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number.parseInt(e.target.dataset.index)
      cart.splice(idx, 1)
      localStorage.setItem("cart", JSON.stringify(cart))
      loadCart()
    })
  })
}

document.addEventListener("DOMContentLoaded", loadCart)
