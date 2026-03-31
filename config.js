// URL бэкенда для запросов API (заявка, каталог). Подставьте свой домен с HTTPS, когда настроите nginx.
// Если страница открыта с того же хоста, что и API (например http://IP:3000), оставляем пустым — используются относительные пути.
(function () {
  if (typeof window === "undefined") return;
  if (window.BACKEND_BASE_URL) return;
  var h = (window.location.hostname || "").toLowerCase();
  if (h.endsWith(".github.io")) {
    window.BACKEND_BASE_URL = "http://194.67.119.92:3000";
  }
})();
