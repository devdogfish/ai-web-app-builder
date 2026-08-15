MktoForms2.whenReady(function(form) {

  const map = {
    "FirstName": "given-name",
    "LastName": "family-name",
    "Title": "organization-title",
    "Company": "organization",
    "Email": "email"
  };

  Object.keys(map).forEach(function(field){
    form.getFormElem()
        .find("[name='" + field + "']")
        .attr("autocomplete", map[field]);
  });

});