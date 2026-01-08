let cardId = ""

function formatCardId(value) {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, "")

  // Format as XXXX-XXXX-XXXX-XXXX
  const formatted = digits.match(/.{1,4}/g)
  return formatted ? formatted.join("-") : ""
}

function updateDisplay() {
  const display = document.getElementById("cardIdDisplay")
  display.value = formatCardId(cardId)

  // Enable/disable proceed button
  const proceedBtn = document.getElementById("proceedBtn")
  proceedBtn.disabled = cardId.length !== 16
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
    cardId = ""
  } else if (value === "delete") {
    cardId = cardId.slice(0, -1)
  } else if (cardId.length < 16) {
    cardId += value
  } else {
    showError("Card ID must be 16 digits")
    return
  }

  updateDisplay()
}

function goBack() {
  window.location.href = "../html/cashless.html"
}

function proceedToMpin() {
  if (cardId.length !== 16) {
    showError("Please enter a valid 16-digit Card ID")
    return
  }

  // Store card ID for next step
  localStorage.setItem("teopayCardId", cardId)
  console.log("[v0] Teo Pay Card ID entered:", cardId)

  // Navigate to MPIN page
  window.location.href = "../html/mpinteopay.html"
}

document.addEventListener("DOMContentLoaded", () => {
  // Setup keypad event listeners
  document.querySelectorAll(".key").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.value
      handleKeyPress(value)
    })
  })

  // Setup proceed button
  document.getElementById("proceedBtn").addEventListener("click", proceedToMpin)

  // Initial state
  updateDisplay()
})
