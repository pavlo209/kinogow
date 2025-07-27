
<?php
require '../config.php';
session_start();

if (!($_SESSION['is_admin'] ?? false)) {
  header("Location: ../login.php");
  exit;
}

$stmt = $pdo->query("
  SELECT users.id, users.email, COUNT(cars.id) AS total_cars
  FROM users
  LEFT JOIN cars ON cars.seller_id = users.id
  GROUP BY users.id
  ORDER BY users.email
");
$users = $stmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Користувачі</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="../style.css">
</head>
<body class="bg-light">
    <?php include 'header_admin.php'; ?>
<div class="container py-4">
  <h3>👤 Користувачі</h3>
  <table class="table table-bordered table-striped align-middle mt-3">
    <thead class="table-dark">
      <tr>
        <th>ID</th>
        <th>Email</th>
        <th>Доданих авто</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($users as $u): ?>
        <tr>
          <td><?php echo $u['id']; ?></td>
          <td><?php echo htmlspecialchars($u['email']); ?></td>
          <td><?php echo $u['total_cars']; ?></td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
</div>
</body>
</html>

