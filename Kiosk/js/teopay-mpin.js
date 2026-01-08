let mpin = ""

function updatePinDisplay() {
  for (let i = 1; i <= 6; i++) {
    const dot = document.getElementById(`dot${i}`)
    if (i <= mpin.length) {
      dot.classList.add("filled")
    } else {
      dot.classList.remove("filled")
    }
  }

  // Enable/disable proceed button
  const proceedBtn = document.getElementById("proceedBtn")
  proceedBtn.disabled = mpin.length !== 6
}

function showError(message) {
  const errorDiv = document.getElementById("errorMessage")
  errorDiv.textContent = message
  setTimeout(() => {
    errorDiv.textContent = ""
  }, 3000)
}

function handleKeyPress(value) {
  const errorDiv = document.getElementById("errorMessage")
  errorDiv.textContent = ""

  if (value === "clear") {
    mpin = ""
  } else if (value === "delete") {
    mpin = mpin.slice(0, -1)
  } else if (mpin.length < 6) {
    mpin += value
  } else {
    showError("MPIN must be 6 digits")
    return
  }

  updatePinDisplay()
}

function goBack() {
  localStorage.removeItem("teopayCardId")
  window.location.href = "../html/teopaycardid.html"
}

function maskCardId(cardId) {
  // Show only last 4 digits: XXXX-XXXX-XXXX-1234
  return `XXXX-XXXX-XXXX-${cardId.slice(-4)}`
}

async function verifyPaymentAndProceed() {
  if (mpin.length !== 6) {
    showError("Please enter a valid 6-digit MPIN")
    return
  }

  const cardId = localStorage.getItem("teopayCardId")
  if (!cardId) {
    showError("Card ID not found. Please start over.")
    setTimeout(() => {
      window.location.href = "../html/teopaycardid.html"
    }, 2000)
    return
  }

  // Show loading overlay
  const loadingOverlay = document.getElementById("loadingOverlay")
  loadingOverlay.classList.add("show")

  console.log("[v0] Verifying Teo Pay payment...", {
    cardId: cardId,
    mpin: "******",
  })

  // Simulate API call to verify Teo Pay credentials and deduct balance
  // In production, this will call your backend API
  try {
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // TODO: Replace with actual API call
    // const response = await fetch('/api/teopay/verify', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ cardId, mpin })
    // });
    // const result = await response.json();

    // Mock successful verification
    const isValid = true // Replace with actual API response
    const hasBalance = true // Replace with actual balance check

    if (!isValid) {
      loadingOverlay.classList.remove("show")
      showError("Invalid Card ID or MPIN")
      mpin = ""
      updatePinDisplay()
      return
    }

    if (!hasBalance) {
      loadingOverlay.classList.remove("show")
      showError("Insufficient balance in your Teo Pay account")
      mpin = ""
      updatePinDisplay()
      return
    }

    // Payment verified - create order with Teo Pay details
    const order = window.createOrderFromCart()

    if (!order) {
      loadingOverlay.classList.remove("show")
      showError("Error creating order")
      return
    }

    // Update order with Teo Pay payment details
    order.paymentMethod = "Teo Pay"
    order.teopayCardId = cardId
    order.orderType = localStorage.getItem("orderType") || "Dine-in"

    // Generate queue number for Teo Pay (cashless payment)
    order.queueNumber = Math.floor(Math.random() * 900) + 100
    order.status = "paid"

    // Store complete order
    localStorage.setItem("currentOrder", JSON.stringify(order))

    console.log("[v0] Teo Pay payment verified and order created:", order)

    // Clean up temporary data
    localStorage.removeItem("teopayCardId")

    // Navigate to receipt
    setTimeout(() => {
      window.location.href = "../html/receipt.html"
    }, 1000)
  } catch (error) {
    console.error("[v0] Error verifying Teo Pay payment:", error)
    loadingOverlay.classList.remove("show")
    showError("Payment verification failed. Please try again.")
    mpin = ""
    updatePinDisplay()
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Display masked card ID
  const cardId = localStorage.getItem("teopayCardId")
  if (!cardId) {
    alert("Card ID not found. Returning to Card ID page.")
    window.location.href = "../html/teopaycardid.html"
    return
  }

  document.getElementById("maskedCardId").textContent = maskCardId(cardId)

  // Setup keypad event listeners
  document.querySelectorAll(".key").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.value
      handleKeyPress(value)
    })
  })

  // Setup proceed button
  document.getElementById("proceedBtn").addEventListener("click", verifyPaymentAndProceed)

  // Initial state
  updatePinDisplay()
})
