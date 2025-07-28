<?php
require 'config.php';
session_start();

// Обробка форми входу
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $email = $_POST['email'] ?? '';
  $password = $_POST['password'] ?? '';

  $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
  $stmt->execute([$email]);
  $user = $stmt->fetch();

  if ($user && password_verify($password, $user['password'])) {
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['is_admin'] = $user['is_admin'] == 1;

    header("Location: index.php");
    exit;
  } else {
    $error = "Невірний email або пароль";
  }
}
?>

<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Вхід</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
<div class="auth-container">
  <h2>Вхід</h2>
  <?php if (!empty($error)): ?>
    <div class="error"><?php echo $error; ?></div>
  <?php endif; ?>
  <form method="post">
    <label>Email</label>
    <input type="email" name="email" required>

    <label>Пароль</label>
    <input type="password" name="password" required>

    <button type="submit" class="btn btn-primary w-100">Увійти</button>
  </form>
</div>
</body>
</html>
