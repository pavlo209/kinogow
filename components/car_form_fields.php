<?php
function inputField($label, $name, $value = '', $type = 'text') {
    echo "<label class='form-label fw-semibold'>$label</label>
    <input type='$type' name='$name' value='".htmlspecialchars($value)."' class='form-control mb-3 rounded-3 bg-light border-0' required>";
}

function textareaField($label, $name, $value = '') {
    echo "<label class='form-label fw-semibold'>$label</label>
    <textarea name='$name' class='form-control mb-3 rounded-3 bg-light border-0' rows='3' required>".htmlspecialchars($value)."</textarea>";
}

function selectField($label, $name, $options, $selected = '') {
    echo "<label class='form-label fw-semibold'>$label</label>
    <select name='$name' class='form-select mb-3 rounded-3 bg-light border-0' required>";
    echo "<option value=''>—</option>";
    foreach ($options as $option) {
        $isSelected = ($selected === $option) ? 'selected' : '';
        echo "<option value='" . htmlspecialchars($option) . "' $isSelected>" . htmlspecialchars($option) . "</option>";
    }
    echo "</select>";
}
?>

<div class="row">
  <div class="col-md-6">
    <?php
    inputField('Назва авто', 'name', $car['name'] ?? '');
    inputField('Рік', 'year', $car['year'] ?? '', 'number');
    inputField('Перша реєстрація', 'registration_date', $car['registration_date'] ?? '');
    selectField('Тип палива', 'fuel_type', ['Бензин', 'Дизель', 'Гібрид', 'Електро'], $car['fuel_type'] ?? '');
    inputField('Потужність (kW)', 'power_kw', $car['power_kw'] ?? '', 'number');
    inputField('Потужність (HP)', 'power_hp', $car['power_hp'] ?? '', 'number');
    inputField('Обʼєм двигуна', 'engine_cc', $car['engine_cc'] ?? '', 'number');
    selectField('Коробка передач', 'gearbox', ['Механіка', 'Автомат', 'Робот', 'Варіатор'], $car['gearbox'] ?? '');
    selectField('Тип кузова', 'body_type', ['Седан', 'Хетчбек', 'Універсал', 'Позашляховик', 'Купе', 'Кабріолет', 'Мінівен'], $car['body_type'] ?? '');
    inputField('Кількість власників', 'owners', $car['owners'] ?? '', 'number');
    inputField('Ключі', 'keys', $car['keys'] ?? '', 'number');
    inputField('VIN', 'vin', $car['vin'] ?? '');
    ?>
  </div>
  <div class="col-md-6">
    <label class="form-label fw-semibold">Пошкодження (власник)</label>
    <select name="damage_reported" class="form-select mb-3 rounded-3 bg-light border-0" required>
      <option value="">—</option>
      <option value="Так" <?php if (($car['damage_reported'] ?? '') == 'Так') echo 'selected'; ?>>Так</option>
      <option value="Ні" <?php if (($car['damage_reported'] ?? '') == 'Ні') echo 'selected'; ?>>Ні</option>
    </select>
    <label class="form-label fw-semibold">Чи усунено пошкодження?</label>
    <select name="damage_fixed" class="form-select mb-3 rounded-3 bg-light border-0" required>
      <option value="">—</option>
      <option value="Так" <?php if (($car['damage_fixed'] ?? '') == 'Так') echo 'selected'; ?>>Так</option>
      <option value="Ні" <?php if (($car['damage_fixed'] ?? '') == 'Ні') echo 'selected'; ?>>Ні</option>
    </select>
    <?php
    inputField('Екологічний клас', 'eco_class', $car['eco_class'] ?? '');
    inputField('Сидіння', 'seats', $car['seats'] ?? '', 'number');
    selectField('Колір', 'color', ['Чорний', 'Сірий', 'Білий', 'Синій', 'Червоний', 'Сріблястий', 'Зелений', 'Жовтий', 'Коричневий'], $car['color'] ?? '');
    inputField('Пробіг', 'mileage_km', $car['mileage_km'] ?? '', 'number');
    inputField('Дата тех. огляду', 'inspection_date', $car['inspection_date'] ?? '', 'date');
    textareaField('Опис авто', 'description', $car['description'] ?? '');
    textareaField('Сервісна історія', 'service_info', $car['service_info'] ?? '');
    textareaField('Опис пошкоджень', 'condition_description', $car['condition_description'] ?? '');
    textareaField('Огляд пошкоджень (детально)', 'damage_summary', $car['damage_summary'] ?? '');
    textareaField('Звіт по фарбі', 'paint_report', $car['paint_report'] ?? '');
    textareaField('Лакофарбове покриття', 'paint_info', $car['paint_info'] ?? '');
    ?>
    <label class="form-label fw-semibold">Головне фото:</label>
    <input type="file" name="main_image" class="form-control mb-3 rounded-3 bg-light border-0" accept="image/*" onchange="previewImage(this, 'mainPreview')">
    <img id="mainPreview" class="img-thumbnail mb-3" style="max-height: 200px; display:none;">

    <label class="form-label fw-semibold">Додаткові фото:</label>
    <input type="file" name="additional_images[]" class="form-control mb-3 rounded-3 bg-light border-0" accept="image/*" multiple onchange="previewMultiple(this, 'additionalPreview')">
    <div id="additionalPreview" class="d-flex flex-wrap gap-2 mb-3"></div>

    <label class="form-label fw-semibold">Фото пошкоджень:</label>
    <div id="damageList"></div>
    <button type="button" class="btn btn-outline-secondary btn-sm mt-2" onclick="addDamageItem()">+ Додати пошкодження</button>
    <div id="damagePreview" class="d-flex flex-wrap gap-2 mt-3"></div>
  </div>
</div>

<script>
function addDamageItem() {
  const container = document.createElement('div');
  container.className = 'damage-item mb-2';
  container.innerHTML = `
    <div class="d-flex gap-2 align-items-start">
      <input type="file" name="damage_images[]" class="form-control mb-1 rounded-3 bg-light border-0" accept="image/*" onchange="previewSingleDamage(this)">
      <input type="text" name="damage_notes[]" class="form-control rounded-3 bg-light border-0" placeholder="Опис пошкодження">
    </div>
  `;
  document.getElementById('damageList').appendChild(container);
}

function previewImage(input, targetId) {
  const preview = document.getElementById(targetId);
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      preview.src = e.target.result;
      preview.style.display = 'block';
    }
    reader.readAsDataURL(input.files[0]);
  }
}

function previewMultiple(input, targetId) {
  const container = document.getElementById(targetId);
  container.innerHTML = '';
  for (const file of input.files) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'position-relative';
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'img-thumbnail';
      img.style.maxHeight = '100px';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn-close position-absolute top-0 end-0 m-1';
      closeBtn.type = 'button';
      closeBtn.onclick = () => imgWrapper.remove();

      imgWrapper.appendChild(img);
      imgWrapper.appendChild(closeBtn);
      container.appendChild(imgWrapper);
    }
    reader.readAsDataURL(file);
  }
}

function previewSingleDamage(input) {
  const container = document.getElementById('damagePreview');
  const reader = new FileReader();
  reader.onload = function (e) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'position-relative';
    const img = document.createElement('img');
    img.src = e.target.result;
    img.className = 'img-thumbnail';
    img.style.maxHeight = '100px';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-close position-absolute top-0 end-0 m-1';
    closeBtn.type = 'button';
    closeBtn.onclick = () => imgWrapper.remove();

    imgWrapper.appendChild(img);
    imgWrapper.appendChild(closeBtn);
    container.appendChild(imgWrapper);
  }
  if (input.files[0]) reader.readAsDataURL(input.files[0]);
}
</script>
