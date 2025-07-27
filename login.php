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
  <style>
    body { font-family: Arial; background: #f0f0f0; display: flex; justify-content: center; align-items: center; height: 100vh; }
    .login-box { background: #fff; padding: 20px; border-radius: 10px; width: 300px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
    label { display: block; margin-top: 10px; }
    input { width: 100%; padding: 8px; margin-top: 5px; }
    button { margin-top: 15px; width: 100%; padding: 10px; background: #0077cc; color: #fff; border: none; border-radius: 5px; cursor: pointer; }
    .error { color: red; margin-top: 10px; }
  </style>
</head>
<body>
<div class="login-box">
  <h2>Вхід</h2>
  <?php if (!empty($error)): ?>
    <div class="error"><?php echo $error; ?></div>
  <?php endif; ?>
  <form method="post">
    <label>Email</label>
    <input type="email" name="email" required>

    <label>Пароль</label>
    <input type="password" name="password" required>

    <button type="submit">Увійти</button>
  </form>
</div>
</body>
</html>
