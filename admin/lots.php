
<?php
require '../config.php';
session_start();

if (!($_SESSION['is_admin'] ?? false)) {
  header("Location: ../login.php");
  exit;
}

$stmt = $pdo->query("SELECT cars.*, users.email FROM cars LEFT JOIN users ON cars.seller_id = users.id ORDER BY created_at DESC");
$cars = $stmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Усі лоти | Адмінка</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
    <?php include 'header_admin.php'; ?>

<div class="container py-4">
  <h2 class="mb-4">Усі лоти (<?php echo count($cars); ?>)</h2>
  <table class="table table-bordered table-striped align-middle">
    <thead class="table-dark">
      <tr>
        <th>ID</th>
        <th>Назва</th>
        <th>Рік</th>
        <th>Продавець</th>
        <th>Статус</th>
        <th>Початок</th>
        <th>Завершення</th>
        <th>Дії</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($cars as $car): ?>
        <tr>
          <td><?php echo $car['id']; ?></td>
          <td><?php echo htmlspecialchars($car['name']); ?></td>
          <td><?php echo $car['year']; ?></td>
          <td><?php echo htmlspecialchars($car['email'] ?? '—'); ?></td>
          <td><?php echo $car['is_approved'] ? '✅ Активний' : '⏳ Очікує'; ?></td>
          <td><?php echo $car['start_time'] ?? '—'; ?></td>
          <td><?php echo $car['end_time'] ?? '—'; ?></td>
          <td>
            <a href="edit_car.php?id=<?php echo $car['id']; ?>" class="btn btn-sm btn-primary">✏️</a>
            <a href="delete_car.php?id=<?php echo $car['id']; ?>" class="btn btn-sm btn-danger" onclick="return confirm('Видалити лот?');">🗑️</a>
            <a href="../lot.php?id=<?php echo $car['id']; ?>" target="_blank" class="btn btn-sm btn-secondary">🔍</a>
          </td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
</div>
</body>
</html>

