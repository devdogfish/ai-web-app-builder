document.addEventListener('DOMContentLoaded', () => {
  const scrollUp = document.getElementById('scrollUp');
  const rootElement = document.documentElement;

  // Ensure the button exists
  if (!scrollUp) return;

  // Get the destination element ID from the href attribute
  const targetId = scrollUp.getAttribute('href').substring(1);
  // Fallback to the body if the 'top' ID is missing
  const targetElement = document.getElementById(targetId) || document.body; 

  // --- 1. Show/Hide Button Logic ---
  function handleScroll() {
    var scrollTotal = rootElement.scrollHeight - rootElement.clientHeight;
    if (rootElement.scrollTop / scrollTotal > 0.25) {
      scrollUp.classList.add('showBtn');
    } else {
      scrollUp.classList.remove('showBtn');
    }
  }
  document.addEventListener('scroll', handleScroll);
  handleScroll(); // Run once on load

  // --- 2. Click Handling and Accessibility Logic (Fixed timing) ---
  scrollUp.addEventListener('click', (e) => {
    e.preventDefault();

    // Start the smooth scroll
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });

    // CRITICAL FIX: Add a one-time listener for the 'scrollend' event.
    // This runs the focus logic ONLY after the smooth scroll animation finishes.
    const handleScrollEnd = () => {
      if (targetElement) {
        // Ensure the target element can receive focus
        targetElement.setAttribute('tabindex', '-1');
        targetElement.focus();
        
        // Remove tabindex once focus moves away to keep natural tab order clean
        targetElement.addEventListener(
          'blur',
          () => {
            targetElement.removeAttribute('tabindex');
          },
          { once: true }
        );
      }
      // Clean up the scrollend listener after it runs once
      document.removeEventListener('scrollend', handleScrollEnd);
    };

    // Listen for the end of the scroll animation
    document.addEventListener('scrollend', handleScrollEnd);
  });
});
