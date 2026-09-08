/* Admin panel behaviour: confirm dialogs, upload preview, busy buttons. */
(function () {
  'use strict';

  /* Confirmation before delete / bulk actions */
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (form.dataset.confirmed === 'true') return;
      event.preventDefault();
      var message = form.getAttribute('data-confirm') || 'Are you sure?';

      var dialog = document.createElement('dialog');
      dialog.innerHTML =
        '<h2>Please confirm</h2><p></p>' +
        '<div class="dialog-actions">' +
        '<button type="button" class="btn" data-cancel>Cancel</button>' +
        '<button type="button" class="btn btn-danger" data-confirm-ok>Yes, continue</button>' +
        '</div>';
      dialog.querySelector('p').textContent = message;
      document.body.appendChild(dialog);

      dialog.addEventListener('cancel', function () { dialog.close(); });
      dialog.querySelector('[data-cancel]').addEventListener('click', function () { dialog.close(); });
      dialog.querySelector('[data-confirm-ok]').addEventListener('click', function () {
        form.dataset.confirmed = 'true';
        dialog.close();
        form.submit();
      });
      dialog.addEventListener('close', function () { dialog.remove(); });
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  });

  /* Upload photo preview */
  var fileInput = document.querySelector('input[type="file"][name="image"]');
  var preview = document.querySelector('[data-preview]');
  if (fileInput && preview) {
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) {
        preview.hidden = true;
        preview.innerHTML = '';
        return;
      }
      var url = URL.createObjectURL(file);
      preview.innerHTML = '';
      var img = document.createElement('img');
      img.alt = 'Selected photo preview';
      img.src = url;
      var caption = document.createElement('span');
      caption.textContent = file.name;
      preview.appendChild(img);
      preview.appendChild(caption);
      preview.hidden = false;
    });
  }

  /* Busy state on submit buttons */
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var button = form.querySelector('button[type="submit"]');
      if (button && !form.querySelector('[data-confirm]')) {
        button.disabled = true;
        if (button.dataset.busyText) button.textContent = button.dataset.busyText;
      }
    });
  });

  /* Auto-dismiss flash messages */
  document.querySelectorAll('.flash').forEach(function (flash) {
    window.setTimeout(function () {
      flash.style.transition = 'opacity 0.5s ease';
      flash.style.opacity = '0';
      window.setTimeout(function () { flash.remove(); }, 500);
    }, 3500);
  });
})();
