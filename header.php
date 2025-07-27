<?php
session_start();
require_once 'config.php';

// Рахуємо активні лоти
$stmt = $pdo->query("SELECT COUNT(*) FROM cars WHERE end_time > NOW()");
$activeLots = $stmt->fetchColumn();

// Рахуємо обране
$favCount = 0;
if (!empty($_SESSION['user_id'])) {
  $userId = $_SESSION['user_id'];
  $favStmt = $pdo->prepare("SELECT COUNT(*) FROM favorites WHERE user_id = ?");
  $favStmt->execute([$userId]);
  $favCount = $favStmt->fetchColumn();
}
?>

<!-- Bootstrap 5 CSS & JS -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

<!-- Додатковий стиль -->
<style>
  .nav-counter {
    background: #dc3545;
    color: #fff;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 12px;
    margin-left: 6px;
  }
  .navbar-brand {
    font-weight: bold;
    font-size: 24px;
  }
  .toast-container {
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 1055;
  }
  .toast {
    border: none;
    box-shadow: 0 0 10px rgba(0,0,0,0.2);
  }
</style>

<nav class="navbar navbar-expand-lg navbar-dark bg-dark sticky-top px-4">
  <a class="navbar-brand" href="index.php">🚗 AutoAuction</a>
  <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
    <span class="navbar-toggler-icon"></span>
  </button>

  <div class="collapse navbar-collapse justify-content-end" id="navbarNav">
    <ul class="navbar-nav align-items-center">
      <li class="nav-item">
        <a class="nav-link" href="index.php">
          🏠 Головна
          <span class="nav-counter bg-primary"><?php echo $activeLots; ?></span>
        </a>
      </li>

      <?php if (!empty($_SESSION['user_id'])): ?>
        <li class="nav-item">
          <a class="nav-link" href="buyer_dashboard.php">👤 Кабінет</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="seller_dashboard.php">🚙 Продати авто</a>
        </li>
        <li class="nav-item position-relative">
          <a class="nav-link" href="favorites.php">
            ❤️ Обране
            <?php if ($favCount > 0): ?>
              <span class="nav-counter"><?php echo $favCount; ?></span>
            <?php endif; ?>
          </a>
        </li>
        <?php if (!empty($_SESSION['is_admin'])): ?>
          <li class="nav-item">
            <a class="nav-link" href="admin_moderation.php">🛠 Модерація</a>
          </li>
        <?php endif; ?>
        <li class="nav-item">
          <a class="nav-link text-danger" href="logout.php">🚪 Вийти</a>
        </li>
      <?php else: ?>
        <li class="nav-item">
          <a class="nav-link" href="login.php">🔐 Вхід</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="register.php">📝 Реєстрація</a>
        </li>
      <?php endif; ?>
    </ul>
  </div>
</nav>

<?php if (!empty($_SESSION['user_id'])): ?>
  <?php
    $stmt = $pdo->prepare("SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 3");
    $stmt->execute([$_SESSION['user_id']]);
    $notifications = $stmt->fetchAll();
  ?>
  <div class="toast-container">
    <?php foreach ($notifications as $note): ?>
      <div class="toast align-items-center text-bg-primary show mb-2" role="alert" data-id="<?php echo $note['id']; ?>">
        <div class="d-flex">
          <div class="toast-body">
            <?php echo htmlspecialchars($note['message']); ?>
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    <?php endforeach; ?>
  </div>
  <script>
    document.querySelectorAll('.toast').forEach(function(toast) {
      setTimeout(() => {
        toast.classList.remove('show');
        toast.style.display = 'none';
        // Mark as read
        const id = toast.dataset.id;
        fetch('mark_notification.php?id=' + id);
      }, 5000);
    });
  </script>
<?php endif; ?>
