<?php
require 'config.php';

// Обробка форми реєстрації
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $email = $_POST['email'] ?? '';
  $password = $_POST['password'] ?? '';
  $confirm = $_POST['confirm_password'] ?? '';

  if ($password !== $confirm) {
    $error = "Паролі не співпадають.";
  } else {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
      $error = "Користувач із таким email вже існує.";
    } else {
      $hash = password_hash($password, PASSWORD_DEFAULT);
      $insert = $pdo->prepare("INSERT INTO users (email, password) VALUES (?, ?)");
      $insert->execute([$email, $hash]);
      header("Location: login.php");
      exit;
    }
  }
}
?>

<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Реєстрація</title>
  <link rel="stylesheet" href="style.css">
  <style>
    body { font-family: Arial; background: #f0f0f0; display: flex; justify-content: center; align-items: center; height: 100vh; }
    .register-box { background: #fff; padding: 20px; border-radius: 10px; width: 320px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
    label { display: block; margin-top: 10px; }
    input { width: 100%; padding: 8px; margin-top: 5px; }
    button { margin-top: 15px; width: 100%; padding: 10px; background: #0077cc; color: #fff; border: none; border-radius: 5px; cursor: pointer; }
    .error { color: red; margin-top: 10px; }
  </style>
</head>
<body>
<div class="register-box">
  <h2>Реєстрація</h2>
  <?php if (!empty($error)): ?>
    <div class="error"><?php echo $error; ?></div>
  <?php endif; ?>
  <form method="post">
    <label>Email</label>
    <input type="email" name="email" required>

    <label>Пароль</label>
    <input type="password" name="password" required>

    <label>Підтвердіть пароль</label>
    <input type="password" name="confirm_password" required>

    <button type="submit">Зареєструватись</button>
  </form>
</div>
<?php include 'footer.php'; ?>
</body>
</html>
