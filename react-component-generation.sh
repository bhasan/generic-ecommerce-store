    #!/bin/bash
    COMPONENT_NAME=$1
    mkdir -p src/components/$COMPONENT_NAME
    touch src/components/$COMPONENT_NAME/$COMPONENT_NAME.js
    touch src/components/$COMPONENT_NAME/$COMPONENT_NAME.module.css
    touch src/components/$COMPONENT_NAME/index.js
