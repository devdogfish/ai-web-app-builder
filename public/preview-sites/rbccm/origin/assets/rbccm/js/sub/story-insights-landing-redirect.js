
    (function() {
      const path = window.location.pathname;
      const match = path.match(/^\/en\/story\/(\d{4})\/(\d{2})\/(.+)$/);
      
      if (match) {
        const [, year, month, title] = match;
        const query = window.location.search;
        const hash = window.location.hash;
        window.location.replace(`/en/insights/${year}/${month}/${title}${query}${hash}`);
      }
    })();

