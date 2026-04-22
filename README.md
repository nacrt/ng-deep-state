
deep signals allow you to turn objects into nested writable signals without losing reactivity.

changes will propagade upwards and downwards without causing unnecessary re-computes

# usage example

```ts
type User = {
    id: number;
    name: string;
    attributes: {
        age: number;
        location: string;
    };
    properties: string[];
}

// any writable signal will work
// for example a linkedSignal connected to a resource of some kind
// for this example a simple signal will do
// **do not write to this object directly as changes will not propagate and will cause a desync between the deep signal**
const basic = signal<User>({
    id: 1,
    name: "holden",
    attributes: {
        age: 118,
        location: "iowa"
    },
    properties: [
        "respected",
        "password_expired",
    ]
});

@Component({
    template: `
    ID: <input type="number" disabled [value]="user.id()">
    Name: <input type="text" [(value)]="user.name">

    Is Admin: {{ isAdmin() }}

    Location: <input type="text" readonly [value]="user.attributes.location()">
    Age: <input type="number" [(value)]="user.attributes.age">

    @if (user.attributes.age() > 100) {
        That's old!
    }

    Password Expired: {{ isPasswordExpired() }}
    <button (click)="togglePasswordExpired()">Toggle Password Expired</button>

    Status: {{ user.properties[0]() }}
    <button (click)="toggleStatus()">Toggle Status</button>
    `
})
export class Example {
    // this is the object that you actually want to interact with
    user = toDeepWritableSignal(basic);

    // this will be called if the name changes
    isAdmin = computed(() => {
        return this.user.name() === "admin";
    });

    // this will be called if any array element changes
    isPasswordExpired = computed(() => {
        return this.user.properties().includes("password_expired");
    });

    // if for example we need the length of a deep array but fear that calling the 
    // array signal directly causes too many recomputes, we can put the length into
    // its own computed, and angular will take care of the equality checks
    propertiesLength = computed(() => {
        return this.user.properties().length;
    });

    expensiveStuff = computed(() => {
        const length = this.propertiesLength();

        // pretend that this is an expensive operation
        return Math.pow(length + 1, length + 1);

        // now whenever the user toggles the users status, this signal doesn't get recomputed. only if the properties length changes.
    });

    constructor() {
        effect(() => {
            // since we are calling the root signal, any changes to the user will be printed here
            // this is usually undesired, but does have specific use cases
            console.log("the user was updated!", this.user());
        });

        effect(() => {
            // this effect will be called if any property of the users sub-object `attributes` changes
            console.log("the users attributes changed!", this.user.attributes());
        });
    }

    // in this example, a users password is expired if they have property "password_expired"
    // note that you must always construct a new array instance to inform the equality detector that something has indeed changed
    togglePasswordExpired() {

        const properties = this.user.properties();

        if (properties.includes("password_expired")) {
            const filtered = properties.filter(x => x !== "password_expired");

            this.user.properties.set(filtered);
        }
        else {
            const added = [...properties];
            added.push("password_expired");

            this.user.properties.set(added);
        }
    }

    // array elements can also be accessed directly
    toggleStatus() {
        const status = this.user.properties[0];

        status.set(status() === "respected" ? "disgraced" : "respected");
        
        return;

        // note that this has the same effect as 
        const status = this.user.properties[0]();

        this.user.properties[0].set(status === "respected" ? "disgraced" : "respected");
    }
}
```

# effect example

```ts
const user = toDeepWritableSignal({
    id: 1,
    name: "holden",
    attributes: {
        age: 118,
        location: "iowa"
    },
    properties: [
        "respected",
        "password_expired",
    ]
});

effect(() => {
    console.log(user());
});

effect(() => {
    console.log(user.name());
});

effect(() => {
    console.log(user.attributes());
});

// print 0
`
{
    id: 1,
    name: "holden",
    attributes: {
        age: 118,
        location: "iowa"
    },
    properties: [
        "respected",
        "password_expired",
    ]
}

"holden"

{
    age: 118,
    location: "iowa"
}
`

// action 1
user.id.set(2);

// print 1
`
{
    id: 2,
    name: "holden",
    attributes: {
        age: 118,
        location: "iowa"
    },
    properties: [
        "respected",
        "password_expired",
    ]
}
`
// action 2
user.name.set("smithers");
// print 2
`
{
    id: 2,
    name: "smithers",
    attributes: {
        age: 118,
        location: "iowa"
    },
    properties: [
        "respected",
        "password_expired",
    ]
}

"smithers"
`

// action 3
user.name.set("smithers");
// no output since the name is already smithers

// action 4
user.attributes.set({
    age: 20,
    location: "delta"
});
// print 4
`
{
    id: 2,
    name: "smithers",
    attributes: {
        age: 20,
        location: "delta"
    },
    properties: [
        "respected",
        "password_expired",
    ]
}

{
    age: 20,
    location: "delta"
}
`

// action 5
user.attributes.age.set(30);
// print 5
`
{
    id: 2,
    name: "smithers",
    attributes: {
        age: 30,
        location: "delta"
    },
    properties: [
        "respected",
        "password_expired",
    ]
}

{
    age: 30,
    location: "delta"
}
`
```

# equality

the equality function uses the === operator on primitves

for arrays it will first check if the length matches, and then recursively check if every child matches

objects are assumed to always be different, even if they have the same reference

# limitations

`.set()` and `.update()` are reserved property names

calling `deep_array.length` will not return the amount of items inside the array, but instead return the number of parameters that the signal constructor has.\
this is never useful. use `deep_array().length` instead.\

array instance methods such as `deep_array.map()` or `deep_array.filter()` also don't work as expected. \
you must first de-ref the array first: `deep_array().filter()`

avoid recursion.
